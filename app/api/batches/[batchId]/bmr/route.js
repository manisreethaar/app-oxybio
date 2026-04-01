import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { BMRDocument } from '@/lib/bmr/BMRDocument';

// ─────────────────────────────────────────────────────────────
// GET /api/batches/[batchId]/bmr
// Generates the Batch Manufacturing Record PDF, uploads to
// Supabase Storage, and returns the signed URL.
// CEO/Admin only.
// ─────────────────────────────────────────────────────────────

export async function GET(request, { params }) {
  try {
    const supabase  = createClient();
    const { batchId } = params;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Role check — CEO/admin/research_fellow only
    const { data: emp } = await supabase.from('employees').select('id, full_name, role').eq('email', user.email).single();
    if (!emp || !['ceo', 'admin', 'research_fellow', 'scientist'].includes(emp.role)) {
      return NextResponse.json({ error: 'Access denied. BMR export requires Scientist+ role.' }, { status: 403 });
    }

    // ── Fetch ALL stage data in parallel ─────────────────────
    const [
      batchRes, flasksRes, mediaPrepRes, sterilRes, inocuRes,
      ferReadRes, ferEpRes, strainRes, extractRes,
      qcSampleRes, releaseRes, rejectionRes,
    ] = await Promise.all([
      supabase.from('batches').select('*, formulations(name, code, version)').eq('id', batchId).single(),
      supabase.from('batch_flasks').select('*').eq('batch_id', batchId).order('flask_label'),
      supabase.from('batch_stage_media_prep').select('*').eq('batch_id', batchId).single(),
      supabase.from('batch_stage_sterilisation').select('*').eq('batch_id', batchId).single(),
      supabase.from('batch_stage_inoculation').select('*').eq('batch_id', batchId).single(),
      supabase.from('batch_fermentation_readings').select('*').eq('batch_id', batchId).order('logged_at'),
      supabase.from('batch_fermentation_endpoint').select('*').eq('batch_id', batchId).single(),
      supabase.from('batch_stage_straining').select('*').eq('batch_id', batchId).single(),
      supabase.from('batch_stage_extract_addition').select('*').eq('batch_id', batchId).single(),
      supabase.from('batch_qc_samples').select('*').eq('batch_id', batchId).single(),
      supabase.from('batch_release_record').select('*').eq('batch_id', batchId).single(),
      supabase.from('batch_rejection_record').select('*').eq('batch_id', batchId).single(),
    ]);

    if (!batchRes.data) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });

    // Fetch QC tests if sample exists
    let qcTests = [];
    if (qcSampleRes.data?.id) {
      const { data } = await supabase.from('batch_qc_tests').select('*').eq('sample_id', qcSampleRes.data.id).order('created_at');
      qcTests = data || [];
    }

    // ── Assemble data object ──────────────────────────────────
    const bmrData = {
      batch:                batchRes.data,
      flasks:               flasksRes.data || [],
      mediaPrepData:        mediaPrepRes.data || null,
      sterilisationData:    sterilRes.data || null,
      inoculationData:      inocuRes.data || null,
      fermentationReadings: ferReadRes.data || [],
      fermentationEndpoint: ferEpRes.data || null,
      strainingData:        strainRes.data || null,
      extractData:          extractRes.data || null,
      qcSample:             qcSampleRes.data || null,
      qcTests,
      releaseRecord:        releaseRes.data || null,
      rejectionRecord:      rejectionRes.data || null,
      generatedBy:          emp.full_name,
      generatedAt:          new Date().toISOString(),
    };

    // ── Render PDF to buffer ──────────────────────────────────
    const pdfDoc  = createElement(BMRDocument, { data: bmrData });
    const pdfBuffer = await renderToBuffer(pdfDoc);

    // ── Upload to Supabase Storage ────────────────────────────
    const filename    = `BMR_${batchRes.data.batch_id}_${new Date().toISOString().slice(0,10)}.pdf`;
    const storagePath = `bmr/${batchId}/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    let signedUrl = null;
    if (!uploadError) {
      // Create a long-lived signed URL (1 year = 31536000 sec)
      const { data: urlData } = await supabase.storage
        .from('documents')
        .createSignedUrl(storagePath, 31536000);
      signedUrl = urlData?.signedUrl || null;

      // Update batch record with the URL
      await supabase.from('batches').update({ bmr_url: signedUrl }).eq('id', batchId);

      // Also update release record if it exists
      if (releaseRes.data) {
        await supabase.from('batch_release_record').update({ bmr_url: signedUrl }).eq('batch_id', batchId);
      }

      // Log to document vault
      await supabase.from('documents').insert({
        title:       `BMR — ${batchRes.data.batch_id}`,
        category:    'Batch Record',
        description: `Generated BMR for batch ${batchRes.data.batch_id} (${batchRes.data.sku_target || batchRes.data.experiment_type})`,
        file_url:    signedUrl,
        file_type:   'PDF',
        uploaded_by: emp.id,
        is_gmp:      true,
        metadata:    { batch_id: batchId, generated_at: bmrData.generatedAt },
      }).then(()=>{}).catch(e => console.warn('Document vault log (non-fatal):', e.message));
    } else {
      console.warn('Storage upload failed (non-fatal):', uploadError.message);
    }

    // ── Respond: stream PDF or return URL ─────────────────────
    // If the request has ?download=true, stream the PDF directly
    const url = new URL(request.url);
    if (url.searchParams.get('download') === 'true') {
      return new Response(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length':      String(pdfBuffer.byteLength),
        },
      });
    }

    return NextResponse.json({
      success:    true,
      filename,
      signed_url: signedUrl,
      pages:      3,
      generated_by: emp.full_name,
      generated_at: bmrData.generatedAt,
    });

  } catch (err) {
    console.error('BMR generation error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
