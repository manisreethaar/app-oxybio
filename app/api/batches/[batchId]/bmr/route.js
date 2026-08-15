export const dynamic = 'force-dynamic';
import { createClient as createAnonClient } from '@/utils/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { BMRDocument } from '@/lib/bmr/BMRDocument';

// Service-role client — bypasses RLS for all data reads/writes
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(request, { params }) {
  try {
    // 1. Auth check via anon client (reads session cookie)
    const authClient = createAnonClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { batchId } = params;
    const db = adminClient();

    // 2. Role check
    const { data: emp } = await db
      .from('employees')
      .select('id, full_name, role')
      .eq('email', user.email)
      .single();

    if (!emp || !['ceo', 'admin', 'research_fellow', 'scientist', 'cto'].includes(emp.role)) {
      return NextResponse.json({ error: 'Access denied. BMR export requires Scientist+ role.' }, { status: 403 });
    }

    // 3. Fetch ALL stage data in parallel (service role — no RLS blocking)
    const [
      batchRes, flasksRes, mediaPrepRes, sterilRes,
      inocuRes, ferReadRes, ferEpRes, harvestRes, strainRes, extractRes,
      qcSampleRes, rejectionRes, inventoryUsageRes, incubationRes
    ] = await Promise.all([
      db.from('batches').select('*, formulations(name, code, version, base_volume_ml)').eq('id', batchId).single(),
      db.from('batch_flasks').select('*').eq('batch_id', batchId).order('flask_label'),
      db.from('batch_stage_media_prep').select('*').eq('batch_id', batchId).single(),
      db.from('batch_stage_sterilisation').select('*').eq('batch_id', batchId).single(),
      db.from('batch_flask_inoculations').select('*').eq('batch_id', batchId),
      db.from('batch_fermentation_readings').select('*').eq('batch_id', batchId).order('logged_at'),
      db.from('batch_flask_endpoints').select('*').eq('batch_id', batchId),
      db.from('batch_stage_harvest').select('*').eq('batch_id', batchId),
      db.from('batch_flask_straining').select('*').eq('batch_id', batchId),
      db.from('batch_flask_extract_addition').select('*').eq('batch_id', batchId),
      db.from('batch_flask_qc_samples').select('*').eq('batch_id', batchId),
      db.from('batch_flask_rejection_record').select('*').eq('batch_id', batchId),
      db.from('inventory_usage')
        .select('*, inventory_stock(supplier_batch_number, expiry_date, inventory_items(name, unit))')
        .eq('batch_id', batchId),
      db.from('sample_incubation_records').select('*').eq('batch_id', batchId).order('start_time'),
    ]);

    if (!batchRes.data) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });

    // 4. Fetch release records, QC tests, and Audit Logs via flask IDs/batch ID
    const flaskIds = flasksRes.data?.map(f => f.id) || [];
    let releaseData = [];
    let auditLogs = [];
    if (flaskIds.length > 0 || batchId) {
      const { data } = await db
        .from('batch_flask_release_record')
        .select('*')
        .in('flask_id', flaskIds);
      releaseData = data || [];
      
      const recordIds = [batchId, ...flaskIds];
      const { data: logsData } = await db
        .from('system_audit_logs')
        .select('*, employees!system_audit_logs_changed_by_fkey(full_name, role)')
        .in('record_id', recordIds)
        .order('changed_at');
      auditLogs = logsData || [];
    }

    // 5. Fetch QC tests
    const sampleIds = qcSampleRes.data?.map(s => s.id) || [];
    let qcTests = [];
    if (sampleIds.length > 0) {
      const { data } = await db
        .from('batch_flask_qc_tests')
        .select('*')
        .in('sample_id', sampleIds)
        .order('created_at');
      qcTests = data || [];
    }

    // 6. Assemble BMR data object
    const bmrData = {
      batch:             batchRes.data,
      mediaPrepData:     mediaPrepRes.data  || null,
      sterilisationData: sterilRes.data     || null,
      flasks:            flasksRes.data     || [],
      flaskInoculations: inocuRes.data      || [],
      flaskReadings:     ferReadRes.data    || [],
      flaskEndpoints:    ferEpRes.data      || [],
      flaskHarvest:      harvestRes.data    || [],
      flaskStraining:    strainRes.data     || [],
      flaskExtracts:     extractRes.data    || [],
      flaskQCSamples:    qcSampleRes.data   || [],
      flaskQCTests:      qcTests,
      flaskReleases:     releaseData,
      flaskRejections:   rejectionRes.data  || [],
      sampleIncubations: incubationRes.data  || [],
      inventoryUsage:    inventoryUsageRes.data || [],
      auditLogs:         auditLogs,
      generatedBy:       emp.full_name,
      generatedAt:       new Date().toISOString(),
    };

    // 7. Render PDF
    const pdfDoc    = createElement(BMRDocument, { data: bmrData });
    const pdfBuffer = await renderToBuffer(pdfDoc);

    // 8. Upload to Supabase Storage
    const filename    = `BMR_${batchRes.data.batch_id}_${new Date().toISOString().slice(0, 10)}.pdf`;
    const storagePath = `bmr/${batchId}/${filename}`;

    const { error: uploadError } = await db.storage
      .from('document-vault')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });

    let signedUrl = null;
    if (!uploadError) {
      const { data: urlData } = await db.storage
        .from('document-vault')
        .createSignedUrl(storagePath, 31536000); // 1-year URL
      signedUrl = urlData?.signedUrl || null;

      if (signedUrl) {
        // Update batch and release records with BMR URL
        await db.from('batches').update({ bmr_url: signedUrl }).eq('id', batchId);
        if (flaskIds.length > 0) {
          await db.from('batch_flask_release_record')
            .update({ bmr_url: signedUrl })
            .in('flask_id', flaskIds);
        }
        // Log to Document Vault (non-fatal) — columns: title, category, file_url, file_name, uploaded_by, notes
        db.from('documents').insert({
          title:       `BMR — ${batchRes.data.batch_id}`,
          category:    'Batch Record',
          file_url:    signedUrl,
          file_name:   filename,
          uploaded_by: emp.id,
          notes:       `Auto-generated BMR for batch ${batchRes.data.batch_id} (${batchRes.data.sku_target || batchRes.data.experiment_type || ''})`,
        }).then(() => {}).catch(e => console.warn('Document vault log (non-fatal):', e.message));
      }
    } else {
      console.warn('[bmr] storage upload failed:', uploadError.message);
    }

    // 9. If ?download=true — stream the PDF directly
    const url = new URL(request.url);
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    if (url.searchParams.get('download') === 'true') {
      return new Response(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length':      String(pdfBuffer.byteLength),
          'X-File-Hash':         hash,
        },
      });
    }

    return NextResponse.json({
      success:      true,
      filename,
      signed_url:   signedUrl,
      generated_by: emp.full_name,
      generated_at: bmrData.generatedAt,
      file_hash:    hash,
    });

  } catch (err) {
    console.error('[bmr] generation error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
