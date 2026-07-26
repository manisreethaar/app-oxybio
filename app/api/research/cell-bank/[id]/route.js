import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';
import { syncCellBankStepToLNB } from '@/lib/lnbSync';
import { requireResearchAccess } from '@/lib/research/access';
import { deductFormulationFIFO } from '@/lib/inventory/bomUtils';

export const dynamic = 'force-dynamic';


export async function GET(request, { params }) {
  try {
    const supabase = createClient();
    const access = await requireResearchAccess(supabase);
    if (access.error) return access.error;

    const adminSupabase = createAdminClient();

    const { data, error } = await adminSupabase
      .from('cell_bank_preparations')
      .select(`
        *,
        linked_formulation:formulations(id, code, name, version, category, status),
        cell_bank_strains(id, name, source_type, accession_number, isolation_source, taxonomy, strain_short_code, notes, formulation_id, characterization, linked_formulation:formulations(id, code, name, version, category, status)),
        parent:parent_id(id, prep_code, type, step_data, formulation_id),
        employees!cell_bank_preparations_created_by_fkey(full_name)
      `)
      .eq('id', params.id)
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    // Fetch QC releaser name separately to avoid FK constraint name ambiguity
    let qcReleasedEmployee = null;
    if (data.qc_released_by) {
      const { data: qcEmp } = await adminSupabase
        .from('employees')
        .select('full_name')
        .eq('id', data.qc_released_by)
        .maybeSingle();
      qcReleasedEmployee = qcEmp || null;
    }

    // Fetch linked incubation records for this preparation
    const { data: incubations } = await adminSupabase
      .from('sample_incubation_records')
      .select('id, sample_name, sample_type, start_time, end_time, duration_hours, sterility_status, colony_count, cfu_per_ml, colony_morphology, microscopic_morphology, incubation_temp_c, media_used, lab_bench_sample_id, source_label, log_hour, timepoint_label, plate_label, plate_index, plate_total')
      .eq('cell_bank_preparation_id', params.id)
      .order('created_at', { ascending: true });

    const { data: lnbEntry } = await adminSupabase
      .from('lab_notebook_entries')
      .select('id')
      .eq('cell_bank_preparation_id', params.id)
      .neq('status', 'Countersigned')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ success: true, data: { ...data, qc_released_employee: qcReleasedEmployee, incubations: incubations || [], lnb_entry_id: lnbEntry?.id || null } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const supabase = createClient();
    const access = await requireResearchAccess(supabase);
    if (!access || access.error) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const adminSupabase = createAdminClient();
    const body = await request.json();

    // -- QC Release action ------------------------------------------------
    if (body.action === 'qc_release') {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      const { data: emp } = await adminSupabase.from('employees').select('id').eq('email', user.email).single();
      const { data, error } = await adminSupabase.from('cell_bank_preparations')
        .update({ qc_released: true, qc_released_by: emp?.id || access.emp?.id, qc_released_at: new Date().toISOString() })
        .eq('id', params.id).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data });
    }

    // -- Edit strain -------------------------------------------------------
    if (body.target === 'strain') {
      const n = (v) => (v === '' || v === undefined ? null : v);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const sourceType = body.source_type || 'Other';
      const allowedSourceTypes = ['MTCC', 'NCIM', 'Isolated', 'Other'];

      if (!name) {
        return NextResponse.json({ success: false, error: 'Strain name is required.' }, { status: 400 });
      }

      if (!allowedSourceTypes.includes(sourceType)) {
        return NextResponse.json({ success: false, error: 'Invalid strain source type.' }, { status: 400 });
      }

      const updates = {
        name,
        source_type:       sourceType,
        accession_number:  n(body.accession_number),
        strain_short_code: body.strain_short_code ? String(body.strain_short_code).trim().toUpperCase().slice(0, 4) : null,
        isolation_source:  n(body.isolation_source),
        received_date:     n(body.received_date),
        taxonomy:          n(body.taxonomy),
        notes:             n(body.notes),
        formulation_id:    n(body.formulation_id),
        updated_at:        new Date().toISOString(),
      };

      // Accept characterization updates
      if (body.characterization !== undefined) {
        updates.characterization = body.characterization || {};
      }

      const { data, error } = await adminSupabase
        .from('cell_bank_strains')
        .update(updates)
        .eq('id', params.id)
        .select('*, linked_formulation:formulations(id,code,name,version,category)')
        .single();
      if (error) {
        return NextResponse.json({ success: false, error: error.message || 'Unable to update strain.' }, { status: 400 });
      }
      if (!data) {
        return NextResponse.json({ success: false, error: 'Strain not found.' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data });
    }

    // -- Register vials action ---------------------------------------------
    if (body.action === 'register_vials') {
      const { count, storage_temp, freezer_id, rack, box, expires_at, vial_expiries } = body;
      if (!count || count < 1) return NextResponse.json({ success: false, error: 'count must be >= 1' }, { status: 400 });

      // Fetch prep + strain for code generation
      const { data: prep, error: prepErr } = await adminSupabase
        .from('cell_bank_preparations')
        .select('type, prep_code, strain_id, cell_bank_strains(strain_short_code)')
        .eq('id', params.id)
        .single();
      if (prepErr || !prep) return NextResponse.json({ success: false, error: 'Preparation not found' }, { status: 404 });

      const year = String(new Date().getFullYear()).slice(-2);
      const short = (prep.cell_bank_strains?.strain_short_code || 'XX').toUpperCase();
      const baseCode = `${prep.type}-${year}-${short}`;

      const vialRows = Array.from({ length: count }, (_, i) => {
        // vial_expiries is an array of per-vial expiry dates; falls back to global expires_at
        const vialExpiry = vial_expiries?.[i] || expires_at || null;
        return {
          preparation_id: params.id,
          vial_code: `${baseCode}-${String(i + 1).padStart(3, '0')}`,
          storage_temp: storage_temp || '-20degC',
          freezer_id: freezer_id || null,
          rack: rack || null,
          box: box || null,
          status: 'Available',
          expires_at: vialExpiry || null,
        };
      });

      const { data: vials, error: vialErr } = await adminSupabase.from('cell_bank_vials').insert(vialRows).select();
      if (vialErr) throw vialErr;

      // Insert log entries for each vial
      const logRows = vials.map(v => ({
        vial_id: v.id,
        action: 'registered',
        operator_id: access.emp?.id || null,
      }));
      try { await adminSupabase.from('cell_bank_vial_logs').insert(logRows); } catch (_) {}

      // Update prep vial_count
      await adminSupabase.from('cell_bank_preparations').update({ vial_count: count }).eq('id', params.id);
      await syncCellBankStepToLNB(
        adminSupabase,
        params.id,
        prep.prep_code,
        'vial_storage',
        {
          count,
          storage_temp: storage_temp || '-20degC',
          freezer_id: freezer_id || null,
          rack: rack || null,
          box: box || null,
          vial_codes: vials.map(v => v.vial_code),
          completed: true,
        },
        access.emp?.id
      );

      return NextResponse.json({ success: true, vials });
    }

    // -- Standard step_data / status update --------------------------------
    const { step_key, step_data_patch, status, vial_count, notes, formulation_id } = body;

    const { data: current, error: fetchErr } = await adminSupabase
      .from('cell_bank_preparations')
      .select('step_data, status')
      .eq('id', params.id)
      .single();
    if (fetchErr || !current) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    const updates = {};

    if (step_key && step_data_patch) {
      updates.step_data = {
        ...(current.step_data || {}),
        [step_key]: { ...(current.step_data?.[step_key] || {}), ...step_data_patch },
      };
    }

    // Support direct step_data override (used for stability_tests etc.)
    if (body.step_data && !step_key) {
      updates.step_data = {
        ...(current.step_data || {}),
        ...body.step_data,
      };
    }

    if (status) {
      updates.status = status;
      if (status === 'Completed') updates.completed_at = new Date().toISOString();
    }

    if (vial_count !== undefined) updates.vial_count = vial_count;
    if (notes !== undefined) updates.notes = notes;
    if (formulation_id !== undefined) updates.formulation_id = formulation_id || null;

    const { data, error } = await adminSupabase
      .from('cell_bank_preparations')
      .update(updates)
      .eq('id', params.id)
      .select('*, cell_bank_strains(name)')
      .single();
    if (error) throw error;

    // Sync step to LNB -- fire and forget
    if (status === 'Completed') {
      await syncCellBankStepToLNB(
        adminSupabase,
        params.id,
        data.prep_code,
        'completion',
        {
          status: data.status,
          vial_count: data.vial_count,
          completed_at: data.completed_at,
        },
        access.emp?.id
      );
    }

    if (step_key && step_data_patch) {
      syncCellBankStepToLNB(
        adminSupabase,
        params.id,
        data.prep_code,
        step_key,
        step_data_patch,
        access.emp?.id
      ).catch(() => {});
      
      // Auto-deduct inventory if formulations are provided and it's the first time saving them as completed
      if (!current.step_data?.[step_key]?.completed && step_data_patch.completed) {
        let formId = null;
        let vol = 0;
        if (step_key.startsWith('broth_culture') && step_data_patch.media_formulation_id && step_data_patch.media_formulation_id !== 'custom') {
          formId = step_data_patch.media_formulation_id;
          vol = parseFloat(step_data_patch.volume_ml) || 0;
        } else if (step_key === 'plating' && step_data_patch.agar_formulation_id && step_data_patch.agar_formulation_id !== 'custom') {
          formId = step_data_patch.agar_formulation_id;
          vol = (parseFloat(step_data_patch.plates_poured) || 0) * 20; // assume 20ml per plate
        }
        
        if (formId && vol > 0) {
          deductFormulationFIFO(
            adminSupabase, formId, vol, 
            `cell_bank_${step_key}`, 
            params.id, 
            access.emp?.id, 
            `Cell Bank Prep ${data.prep_code}`
          ).catch(e => console.error('[cell-bank] Auto-deduct failed:', e));
        }
      }
    }

    // Auto-create incubation record(s) when plating step is saved with plates_poured
    if (step_key === 'plating' && parseInt(step_data_patch?.plates_poured, 10) > 0) {
      try {
        const { count: existing } = await adminSupabase
          .from('sample_incubation_records')
          .select('id', { count: 'exact', head: true })
          .eq('cell_bank_preparation_id', params.id);

        if ((existing || 0) === 0) {
          const plateCount = Math.min(20, Math.max(1, parseInt(step_data_patch.plates_poured, 10)));
          const sourceLabel = data.prep_code || params.id;
          const strainName = data.cell_bank_strains?.name || null;
          const baseLabel = [sourceLabel, strainName].filter(Boolean).join(' -- ');
          const loggedAt = new Date().toISOString();
          const observation = [
            step_data_patch.agar_media  ? `Media: ${step_data_patch.agar_media}` : null,
            step_data_patch.dilution    ? `Dilution: ${step_data_patch.dilution}` : null,
            step_data_patch.incubation_hours ? `Expected: ${step_data_patch.incubation_hours}h` : null,
          ].filter(Boolean).join(' | ') || null;

          const incRows = Array.from({ length: plateCount }, (_, i) => ({
            sample_name:             plateCount > 1 ? `${baseLabel} -- Plate ${i + 1}/${plateCount}` : `${baseLabel} -- Plate`,
            sample_category:         'Cell Bank',
            sample_type:             'Agar Plate',
            cell_bank_preparation_id: params.id,
            source_type:             'cell_bank',
            source_id:               params.id,
            source_label:            sourceLabel,
            plate_label:             plateCount > 1 ? `Plate ${i + 1}/${plateCount}` : 'Plate 1',
            plate_index:             i + 1,
            plate_total:             plateCount,
            incubation_date:         loggedAt.slice(0, 10),
            start_time:              loggedAt,
            incubation_temp_c:       step_data_patch.incubation_temp ? parseFloat(step_data_patch.incubation_temp) : null,
            sterility_status:        'Pending',
            source_stage:            'cell_bank',
            sampled_at:              loggedAt,
            observation,
            logged_by:               access.emp?.id || null,
          }));

          await adminSupabase.from('sample_incubation_records').insert(incRows);
        }
      } catch (syncErr) {
        console.error('[cell-bank/plating] incubation sync failed:', syncErr.message);
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const supabase = createClient();
    const access = await requireResearchAccess(supabase);
    if (access.error) return access.error;

    const adminSupabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const target = searchParams.get('target') || 'preparation';

    if (target === 'strain') {
      // Guard: block if strain has any preparations
      const { count: prepCount } = await adminSupabase
        .from('cell_bank_preparations')
        .select('id', { count: 'exact', head: true })
        .eq('strain_id', params.id);

      if (prepCount > 0) {
        return NextResponse.json({
          success: false,
          error: `Cannot delete strain — it has ${prepCount} preparation(s) linked to it. Delete or discard all preparations first.`,
          blocked: true,
        }, { status: 409 });
      }

      const { error } = await adminSupabase.from('cell_bank_strains').delete().eq('id', params.id);
      if (error) throw error;

    } else {
      // Guard: block if preparation has any registered vials
      const { data: prep } = await adminSupabase
        .from('cell_bank_preparations')
        .select('prep_code, vial_count, status')
        .eq('id', params.id)
        .single();

      if (!prep) return NextResponse.json({ success: false, error: 'Preparation not found' }, { status: 404 });

      // Count actual vials in the vials table (source of truth, not just vial_count column)
      const { count: vialCount } = await adminSupabase
        .from('cell_bank_vials')
        .select('id', { count: 'exact', head: true })
        .eq('preparation_id', params.id);

      if (vialCount > 0) {
        return NextResponse.json({
          success: false,
          error: `Cannot delete ${prep.prep_code} — it has ${vialCount} registered vial(s). Vial data would be permanently lost. Use "Discard" to mark it as inactive instead.`,
          blocked: true,
          vial_count: vialCount,
        }, { status: 409 });
      }

      // Also block if preparation is Completed (extra safety)
      if (prep.status === 'Completed') {
        return NextResponse.json({
          success: false,
          error: `Cannot delete ${prep.prep_code} — status is Completed. Use "Discard" to mark it as inactive if it is no longer needed.`,
          blocked: true,
        }, { status: 409 });
      }

      const { error } = await adminSupabase.from('cell_bank_preparations').delete().eq('id', params.id);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

