import {
  Document, Page, Text, View, StyleSheet, Font
} from '@react-pdf/renderer';

// ── Color system ─────────────────────────────────────────────
const C = {
  navy:      '#1e3a5f',
  navyLight: '#2d4f7f',
  accent:    '#0ea5e9',
  emerald:   '#059669',
  red:       '#dc2626',
  amber:     '#d97706',
  gray900:   '#111827',
  gray700:   '#374151',
  gray500:   '#6b7280',
  gray300:   '#d1d5db',
  gray100:   '#f3f4f6',
  white:     '#ffffff',
};

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: C.gray900, backgroundColor: C.white, paddingTop: 48, paddingBottom: 56, paddingHorizontal: 40 },

  // Header
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 2, borderBottomColor: C.navy, paddingBottom: 12, marginBottom: 16 },
  headerLeft:  { flex: 1 },
  companyName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.navy, letterSpacing: 1 },
  docTitle:    { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navyLight, marginTop: 2 },
  docSub:      { fontSize: 7.5, color: C.gray500, marginTop: 1 },
  headerRight: { alignItems: 'flex-end' },
  batchId:     { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.navy, letterSpacing: 2 },
  statusBadge: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusText:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.white, letterSpacing: 1 },

  // Batch meta row
  metaRow:     { flexDirection: 'row', gap: 6, marginBottom: 14 },
  metaCell:    { flex: 1, padding: 8, backgroundColor: C.gray100, borderRadius: 4 },
  metaLabel:   { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: C.gray500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  metaValue:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.gray900 },
  metaSub:     { fontSize: 7, color: C.gray500, marginTop: 1 },

  // Section
  section:        { marginBottom: 12 },
  sectionHeader:  { flexDirection: 'row', alignItems: 'center', backgroundColor: C.navy, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 4, marginBottom: 6 },
  sectionNum:     { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.accent, marginRight: 6 },
  sectionTitle:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.white, flex: 1 },
  sectionStatus:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.white, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  sectionBody:    { paddingHorizontal: 4 },

  // Data grid
  dataGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 },
  dataCell:    { backgroundColor: C.gray100, padding: 6, borderRadius: 3, minWidth: 100 },
  dataLabel:   { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: C.gray500, textTransform: 'uppercase', marginBottom: 2 },
  dataValue:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.gray900 },
  dataSub:     { fontSize: 7, color: C.gray500 },

  // CCP fields
  ccpCell:     { backgroundColor: '#fef3c7', borderLeftWidth: 2, borderLeftColor: C.amber, padding: 6, borderRadius: 3, minWidth: 100 },
  ccpLabel:    { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: C.amber, textTransform: 'uppercase', marginBottom: 2 },
  ccpValue:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.gray900 },
  ccpStar:     { fontSize: 7, color: C.amber },

  // Tables
  table:       { marginBottom: 6 },
  tableHead:   { flexDirection: 'row', backgroundColor: C.navyLight, paddingVertical: 4, paddingHorizontal: 4, borderRadius: 3 },
  tableHCell:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.white, textTransform: 'uppercase', flex: 1 },
  tableRow:    { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.gray300, paddingVertical: 3.5, paddingHorizontal: 4 },
  tableRowAlt: { backgroundColor: C.gray100 },
  tableDCell:  { fontSize: 8, color: C.gray700, flex: 1 },
  tableAlarm:  { backgroundColor: '#fef2f2' },

  // Pass/Fail chips
  pass:        { backgroundColor: '#d1fae5', color: C.emerald, fontFamily: 'Helvetica-Bold', fontSize: 7.5, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 3 },
  fail:        { backgroundColor: '#fee2e2', color: C.red,     fontFamily: 'Helvetica-Bold', fontSize: 7.5, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 3 },
  pending:     { backgroundColor: '#fef3c7', color: C.amber,   fontFamily: 'Helvetica-Bold', fontSize: 7.5, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 3 },

  // Notes
  noteBox:     { backgroundColor: C.gray100, borderLeftWidth: 2, borderLeftColor: C.accent, padding: 6, borderRadius: 3, marginTop: 4 },
  noteText:    { fontSize: 7.5, color: C.gray700, lineHeight: 1.5 },

  // Signature block
  sigSection:   { marginTop: 16, flexDirection: 'row', gap: 8 },
  sigBox:       { flex: 1, borderTopWidth: 1.5, borderTopColor: C.navy, paddingTop: 6 },
  sigRole:      { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.navy },
  sigLine:      { fontSize: 7.5, color: C.gray500, marginTop: 2 },

  // Footer
  footer:      { position: 'absolute', bottom: 24, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: C.gray300, paddingTop: 6 },
  footerText:  { fontSize: 6.5, color: C.gray500 },
  pageNum:     { fontSize: 7, color: C.navy, fontFamily: 'Helvetica-Bold' },

  // Alert strip
  alertStrip:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef2f2', borderLeftWidth: 3, borderLeftColor: C.red, padding: 6, borderRadius: 3, marginBottom: 6 },
  alertText:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.red },
  warnStrip:   { flexDirection: 'row', backgroundColor: '#fffbeb', borderLeftWidth: 3, borderLeftColor: C.amber, padding: 6, borderRadius: 3, marginBottom: 6 },
  warnText:    { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.amber },
});

// ── Helper components ─────────────────────────────────────────
const Meta = ({ label, value, sub, ccp = false }) => (
  <View style={ccp ? S.ccpCell : S.dataCell}>
    <Text style={ccp ? S.ccpLabel : S.dataLabel}>{label}{ccp ? ' ★' : ''}</Text>
    <Text style={ccp ? S.ccpValue : S.dataValue}>{value || '—'}</Text>
    {sub && <Text style={S.dataSub}>{sub}</Text>}
  </View>
);

const SectionHdr = ({ num, title, status }) => {
  const bg = status === 'Pass' || status === 'Complete' || status === 'PASS' || status === 'Released' ? C.emerald
           : status === 'Fail' || status === 'Rejected' ? C.red
           : status === 'Pending' ? C.amber : '#4b5563';
  return (
    <View style={S.sectionHeader}>
      <Text style={S.sectionNum}>{num}</Text>
      <Text style={S.sectionTitle}>{title}</Text>
      {status && <View style={[S.sectionStatus, { backgroundColor: bg }]}><Text style={{ color: C.white, fontSize: 7, fontFamily: 'Helvetica-Bold' }}>{status?.toUpperCase()}</Text></View>}
    </View>
  );
};

const PF = ({ v }) => {
  const style = v === 'Pass' || v === 'PASS' ? S.pass : v === 'Fail' || v === 'FAIL' ? S.fail : S.pending;
  return <Text style={style}>{v || 'Pending'}</Text>;
};

const fmt = (v) => v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── Main Document ─────────────────────────────────────────────
export function BMRDocument({ data }) {
  const { 
    batch, mediaPrepData, sterilisationData, flasks, 
    flaskInoculations, flaskReadings, flaskEndpoints, flaskStraining, 
    flaskExtracts, flaskQCSamples, flaskQCTests, flaskReleases, flaskRejections, 
    generatedBy, generatedAt 
  } = data;

  const isReleased    = batch.status === 'released';
  const isRejected    = batch.status === 'rejected';
  const statusColor   = isReleased ? C.emerald : isRejected ? C.red : C.amber;

  // Signatures for common blocks
  const SignatureBlock = () => (
    <View style={S.sigSection}>
      {[
        { role: 'Operator / Scientist', line: 'Name & Signature' },
        { role: 'Reviewed By (Supervisor)', line: 'Name & Signature' },
        { role: 'Approved By (CEO / QA)', line: 'Name & Signature' },
      ].map(s => (
        <View key={s.role} style={S.sigBox}>
          <Text style={S.sigRole}>{s.role}</Text>
          <View style={{ height: 28 }}/>
          <Text style={S.sigLine}>_______________________________</Text>
          <Text style={S.sigLine}>{s.line}</Text>
          <Text style={S.sigLine}>Date: ____________________</Text>
        </View>
      ))}
    </View>
  );

  return (
    <Document author="OxyOS" title={`BMR — ${batch.batch_id}`} subject="Batch Manufacturing Record">

      {/* ═══════════════════════════════════════════════════
          PAGE 1 — Global Batch Summary
      ════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>

        {/* Company Header */}
        <View style={S.header} fixed>
          <View style={S.headerLeft}>
            <Text style={S.companyName}>OXYGEN BIOINNOVATIONS</Text>
            <Text style={S.docTitle}>GLOBAL BATCH RECORD (BMR)</Text>
            <Text style={S.docSub}>GMP-compliant documentation · Master Batch Overview</Text>
          </View>
          <View style={S.headerRight}>
            <Text style={S.batchId}>{batch.batch_id}</Text>
            <View style={[S.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={S.statusText}>{batch.status?.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* Batch Meta */}
        <View style={S.metaRow}>
          <View style={S.metaCell}><Text style={S.metaLabel}>Formulation</Text><Text style={S.metaValue}>{batch.formulations?.name || '—'}</Text><Text style={S.metaSub}>v{batch.formulations?.version}</Text></View>
          <View style={S.metaCell}><Text style={S.metaLabel}>SKU Target</Text><Text style={S.metaValue}>{batch.sku_target || '—'}</Text></View>
          <View style={S.metaCell}><Text style={S.metaLabel}>Experiment Type</Text><Text style={S.metaValue}>{batch.experiment_type || '—'}</Text></View>
          <View style={S.metaCell}><Text style={S.metaLabel}>Total Input Vol</Text><Text style={S.metaValue}>{batch.planned_volume_ml * batch.num_flasks} ml</Text></View>
          <View style={S.metaCell}><Text style={S.metaLabel}>Flask Count</Text><Text style={S.metaValue}>{batch.num_flasks}×</Text></View>
          <View style={S.metaCell}><Text style={S.metaLabel}>Start Date</Text><Text style={S.metaValue}>{fmtDate(batch.start_time)}</Text></View>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 6 }}>TRIAL OUTCOMES</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {flasks?.map(f => (
              <View key={f.id} style={{ padding: 6, backgroundColor: f.status === 'rejected' ? '#fef2f2' : C.gray100, borderRadius: 4, borderLeftWidth: 2, borderLeftColor: f.status === 'rejected' ? C.red : f.status === 'complete' || f.status === 'released' ? C.emerald : C.navy, minWidth: 120 }}>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy }}>{f.flask_label}</Text>
                <Text style={{ fontSize: 7, color: C.gray500 }}>Status: {f.status?.toUpperCase()} | Stage: {f.current_stage}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* §1 Media Prep */}
        <View style={S.section}>
          <SectionHdr num="§1" title="Global Media Preparation" status={mediaPrepData?.is_complete ? 'Complete' : 'Incomplete'} />
          <View style={S.sectionBody}>
            {!mediaPrepData ? <Text style={S.noteText}>No media prep data recorded.</Text> : (
              <>
                <View style={S.dataGrid}>
                  <Meta label="Ragi Lot ID" value={mediaPrepData.ragi_lot_id ? 'LOT-LINKED' : 'Not recorded'} />
                  <Meta label="Ragi Weight (g)" value={mediaPrepData.ragi_weight_g} ccp />
                  <Meta label="Ragi Moisture" value={mediaPrepData.ragi_moisture_pass === true ? 'PASS' : mediaPrepData.ragi_moisture_pass === false ? 'FAIL' : 'N/A'} />
                  <Meta label="Water Volume (ml)" value={mediaPrepData.water_volume_ml} />
                  <Meta label="Total Volume (ml)" value={mediaPrepData.total_volume_ml} />
                  <Meta label="Initial pH" value={mediaPrepData.initial_ph} ccp />
                </View>
                {mediaPrepData.ragi_moisture_pass === false && (
                  <View style={S.alertStrip}><Text style={S.alertText}>⚠ Ragi moisture check FAILED — deviation must be documented.</Text></View>
                )}
                {mediaPrepData.notes && <View style={S.noteBox}><Text style={S.noteText}>{mediaPrepData.notes}</Text></View>}
              </>
            )}
          </View>
        </View>

        {/* §2 Sterilisation */}
        <View style={S.section}>
          <SectionHdr num="§2" title="Global Sterilisation" status={sterilisationData?.pass_fail} />
          <View style={S.sectionBody}>
            {!sterilisationData ? <Text style={S.noteText}>No sterilisation data recorded.</Text> : (
              <>
                <View style={S.dataGrid}>
                  <Meta label="Machine/Method" value={sterilisationData.method} />
                  <Meta label="Cycle Temp (°C)" value={sterilisationData.cycle_temp_c} ccp />
                  <Meta label="Cycle Pressure" value={sterilisationData.cycle_pressure} ccp />
                  <Meta label="Hold Time (min)" value={sterilisationData.hold_time_min} ccp />
                  <Meta label="Cycle Start" value={fmt(sterilisationData.cycle_start)} />
                  <Meta label="Cycle End" value={fmt(sterilisationData.cycle_end)} />
                  <Meta label="Autoclave Tape" value={sterilisationData.autoclave_tape} />
                  <Meta label="Overall Result" value={sterilisationData.pass_fail} />
                </View>
                {sterilisationData.pass_fail === 'Fail' && (
                  <View style={S.alertStrip}><Text style={S.alertText}>🚨 CRITICAL: Sterilisation FAILED. Batch should not have been inoculated.</Text></View>
                )}
                {sterilisationData.notes && <View style={S.noteBox}><Text style={S.noteText}>{sterilisationData.notes}</Text></View>}
              </>
            )}
          </View>
        </View>

        <View style={S.footer} fixed>
          <Text style={S.footerText}>BMR {batch.batch_id} · Global Overview · Originated: {fmtDate(generatedAt)}</Text>
          <Text style={S.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* ═══════════════════════════════════════════════════
          PAGE 2+ — Flask Level Pipeline Loop
      ════════════════════════════════════════════════════ */}
      {flasks?.map((flask, idx) => {
        const inoc = flaskInoculations?.find(x => x.flask_id === flask.id);
        const fReadings = flaskReadings?.filter(x => x.flask_id === flask.id);
        const ep = flaskEndpoints?.find(x => x.flask_id === flask.id);
        const str = flaskStraining?.find(x => x.flask_id === flask.id);
        const ex = flaskExtracts?.find(x => x.flask_id === flask.id);
        const qcS = flaskQCSamples?.find(x => x.flask_id === flask.id);
        const qcT = flaskQCTests?.filter(x => x.sample_id === qcS?.id) || [];
        const rel = flaskReleases?.find(x => x.flask_id === flask.id);
        const rej = flaskRejections?.find(x => x.flask_id === flask.id);

        const tHours = ep?.total_hours || (inoc?.t_zero_time ? ((new Date() - new Date(inoc.t_zero_time)) / 3600000) : 0);

        return (
          <Page key={flask.id} size="A4" style={S.page}>
            <View style={S.header} fixed>
              <View style={S.headerLeft}>
                <Text style={S.companyName}>TRIAL RECORD — {flask.flask_label}</Text>
                <Text style={S.docSub}>R&D Independent Pipeline Record · Linked to Batch {batch.batch_id}</Text>
              </View>
              <View style={S.headerRight}>
                <View style={[S.statusBadge, { backgroundColor: flask.status === 'rejected' ? C.red : flask.status === 'released' ? C.emerald : C.navy }]}>
                  <Text style={S.statusText}>{flask.status?.toUpperCase()}</Text>
                </View>
              </View>
            </View>

            {/* §A Inoculation */}
            <View style={S.section} wrap={false}>
              <SectionHdr num="§A" title="Inoculation Parameter" status={inoc?.t_zero_time ? 'Complete' : 'Incomplete'} />
              <View style={S.sectionBody}>
                {!inoc ? <Text style={S.noteText}>Not yet inoculated.</Text> : (
                  <>
                    <View style={S.dataGrid}>
                      <Meta label="Inoculum Source" value={inoc.backslop_source_batch || inoc.inoculum_type} />
                      <Meta label="Volume (ml)" value={inoc.inoculum_vol_ml} ccp />
                      <Meta label="Media Temp (°C)" value={inoc.inoculation_temp_c} />
                      <Meta label="LAF Used" value={inoc.laf_used ? 'Yes' : 'No'} />
                      <Meta label="Contamination Check" value={inoc.contamination_check} />
                      <Meta label="Planned Fermentation" value={`${inoc.planned_fermentation_hrs} hrs`} />
                    </View>
                    <View style={[S.ccpCell, { marginBottom: 4 }]}>
                      <Text style={S.ccpLabel}>T=0 — TRIAL ANCHOR ★ CCP</Text>
                      <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.navy }}>{fmt(inoc.t_zero_time)}</Text>
                    </View>
                    {inoc.notes && <View style={S.noteBox}><Text style={S.noteText}>{inoc.notes}</Text></View>}
                  </>
                )}
              </View>
            </View>

            {/* §B Fermentation */}
            <View style={S.section} wrap={false}>
              <SectionHdr num="§B" title={`Fermentation Endpoint`} status={ep ? 'Declared' :  inoc?.t_zero_time ? 'In Progress' : 'Pending'} />
              <View style={S.sectionBody}>
                {ep ? (
                  <>
                    <View style={S.dataGrid}>
                      <Meta label="Total Duration" value={`${ep.total_hours?.toFixed(2)} hr`} ccp />
                      <Meta label="Final pH" value={ep.final_ph} ccp />
                      <Meta label="pH OOR" value={ep.ph_out_of_range ? 'YES' : 'No'} />
                      <Meta label="Aroma" value={ep.aroma} />
                      <Meta label="Sensory Overall" value={ep.sensory_overall} />
                    </View>
                    <View style={S.dataGrid}>
                      <Meta label="Colour" value={ep.colour_desc} />
                      <Meta label="Texture" value={ep.texture} />
                      <Meta label="Gram Stain" value={ep.gram_stain} />
                    </View>
                    {ep.notes && <View style={S.noteBox}><Text style={S.noteText}>{ep.notes}</Text></View>}
                  </>
                ) : inoc?.t_zero_time ? (
                  <Text style={S.noteText}>Fermenting in progress (T+{tHours.toFixed(1)}hr). Endpoint not declared.</Text>
                ) : <Text style={S.noteText}>Pending inoculation.</Text>}
                
                {/* Micro chart for readings */}
                {fReadings?.length > 0 && (
                  <View style={[S.table, { marginTop: 6 }]}>
                    <View style={S.tableHead}>
                       <Text style={[S.tableHCell, { flex: 1 }]}>Time / Logged At</Text>
                       <Text style={[S.tableHCell, { flex: 1 }]}>pH</Text>
                       <Text style={[S.tableHCell, { flex: 1 }]}>Temp °C</Text>
                       <Text style={[S.tableHCell, { flex: 1 }]}>Foam</Text>
                    </View>
                    {fReadings.map((r, i) => (
                      <View key={r.id} style={[S.tableRow, (r.is_ph_alarm || r.is_temp_alarm) && S.tableAlarm, i % 2 && S.tableRowAlt]}>
                        <Text style={[S.tableDCell, { flex: 1, fontFamily: 'Helvetica-Bold' }]}>{fmt(r.logged_at)}</Text>
                        <Text style={[S.tableDCell, { flex: 1, color: r.is_ph_alarm ? C.red : C.gray900 }]}>{r.ph}</Text>
                        <Text style={[S.tableDCell, { flex: 1 }]}>{r.incubator_temp_c || '—'}</Text>
                        <Text style={[S.tableDCell, { flex: 1 }]}>{r.foam_level}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* §C Straining */}
            <View style={S.section} wrap={false}>
              <SectionHdr num="§C" title="Straining" status={str ? 'Complete' : 'Pending'} />
              <View style={S.sectionBody}>
                {str ? (
                  <View style={S.dataGrid}>
                    <Meta label="Method" value={str.method} />
                    <Meta label="Recovery Vol" value={`${str.post_straining_vol_ml} ml`} ccp />
                    <Meta label="Recovery %" value={str.recovery_pct ? `${str.recovery_pct}%` : '—'} />
                    <Meta label="Filtrate pH" value={str.filtrate_ph} ccp />
                  </View>
                ) : <Text style={S.noteText}>No straining data recorded.</Text>}
              </View>
            </View>

            {/* §D Extract Addition */}
            <View style={S.section} wrap={false}>
              <SectionHdr num="§D" title="Extract Integration" status={ex ? 'Complete' : 'Pending'} />
              <View style={S.sectionBody}>
                {ex ? (
                  <View style={S.dataGrid}>
                    <Meta label="Extract Sp./Vol" value={`${ex.mushroom_species} ${ex.extract_vol_added_ml}ml`} />
                    <Meta label="Addition %" value={ex.addition_pct ? `${ex.addition_pct}%` : '—'} />
                    <Meta label="Final pH" value={ex.final_product_ph} ccp />
                    <Meta label="Colour After" value={ex.colour_after} />
                  </View>
                ) : <Text style={S.noteText}>No extract integration data recorded.</Text>}
              </View>
            </View>

            {/* §E Quality Control */}
            <View style={S.section} wrap={false}>
              <SectionHdr num="§E" title="Trial QC Tests" status={qcT?.length > 0 && qcT.every(t => t.pass_fail !== 'Pending') ? (qcT.some(t => t.pass_fail === 'Fail') ? 'Fail' : 'Pass') : 'Pending'} />
              <View style={S.sectionBody}>
                {!qcS ? <Text style={S.noteText}>No QC sample ID assigned.</Text> : (
                  <>
                    <View style={S.dataGrid}>
                      <Meta label="Sample ID" value={qcS.sample_id} />
                      <Meta label="Tested At" value={qcS.testing_location} />
                      <Meta label="Sample Vol" value={`${qcS.volume_ml} ml`} />
                    </View>
                    <View style={S.table}>
                      {qcT?.map((t, i) => (
                        <View key={t.id} style={[S.tableRow, t.pass_fail === 'Fail' && S.tableAlarm, i % 2 && t.pass_fail !== 'Fail' && S.tableRowAlt]}>
                          <Text style={[S.tableDCell, { flex: 2, fontFamily: 'Helvetica-Bold' }]}>{t.test_name}</Text>
                          <Text style={[S.tableDCell, { flex: 1.5 }]}>{t.target_spec}</Text>
                          <Text style={[S.tableDCell, { flex: 1 }]}>{t.result_value || '—'}</Text>
                          <View style={{ flex: 0.7 }}><PF v={t.pass_fail} /></View>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>
            </View>

            {/* §F Disposition */}
            <View style={S.section} wrap={false}>
              <SectionHdr num="§F" title="Trial Disposition" status={rel ? 'Released' : rej ? 'Rejected' : 'Pending'} />
              <View style={S.sectionBody}>
                {rel ? (
                  <View style={S.dataGrid}>
                    <Meta label="Yield Vol" value={`${rel.yield_volume_ml} ml`} />
                    <Meta label="Bottles" value={rel.bottles_produced} />
                    <Meta label="Bottle Vol" value={`${rel.bottle_volume_ml} ml`} />
                    {rel.release_notes && <View style={S.noteBox}><Text style={S.noteText}>{rel.release_notes}</Text></View>}
                  </View>
                ) : rej ? (
                  <View style={S.dataGrid}>
                    <Meta label="Rejected At" value={rej.rejection_stage} />
                    <Meta label="Root Cause" value={rej.root_cause} />
                    <Meta label="Disposal" value={rej.disposal_method} />
                    <Meta label="CAPA Req" value={rej.capa_required ? 'YES' : 'No'} />
                  </View>
                ) : <Text style={S.noteText}>Trial has not reached final disposition.</Text>}
              </View>
            </View>

            {/* Signature Block (only on the last trial card or every trial card? Let's do it on every card so it's a complete record.) */}
            <SignatureBlock />

            <View style={S.footer} fixed>
              <Text style={S.footerText}>BMR {batch.batch_id} · Trial {flask.flask_label} · {fmtDate(generatedAt)} · {generatedBy}</Text>
              <Text style={S.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
