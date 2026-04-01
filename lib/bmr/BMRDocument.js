import {
  Document, Page, Text, View, StyleSheet, Font, Image
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

  // Divider
  divider:     { borderBottomWidth: 0.5, borderBottomColor: C.gray300, marginVertical: 6 },

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
  const bg = status === 'Pass' || status === 'Complete' ? C.emerald
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
  const { batch, mediaPrepData, sterilisationData, inoculationData, fermentationReadings,
          fermentationEndpoint, strainingData, extractData, qcSample, qcTests,
          releaseRecord, rejectionRecord, flasks, generatedBy, generatedAt } = data;

  const totalReadings = fermentationReadings?.length || 0;
  const alarmReadings = fermentationReadings?.filter(r => r.is_ph_alarm || r.is_temp_alarm).length || 0;
  const isReleased    = batch.status === 'released';
  const isRejected    = batch.status === 'rejected';
  const statusColor   = isReleased ? C.emerald : isRejected ? C.red : C.amber;

  return (
    <Document author="OxyOS" title={`BMR — ${batch.batch_id}`} subject="Batch Manufacturing Record">

      {/* ═══════════════════════════════════════════════════
          PAGE 1 — Batch Summary + Media Prep + Sterilisation
      ════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>

        {/* Company Header */}
        <View style={S.header} fixed>
          <View style={S.headerLeft}>
            <Text style={S.companyName}>OXYGEN BIOINNOVATIONS</Text>
            <Text style={S.docTitle}>BATCH MANUFACTURING RECORD (BMR)</Text>
            <Text style={S.docSub}>GMP-compliant batch documentation · SOP-001 · Confidential</Text>
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
          <View style={S.metaCell}><Text style={S.metaLabel}>Planned Volume</Text><Text style={S.metaValue}>{batch.planned_volume_ml} ml</Text></View>
          <View style={S.metaCell}><Text style={S.metaLabel}>Flask Count</Text><Text style={S.metaValue}>{batch.num_flasks}×</Text></View>
          <View style={S.metaCell}><Text style={S.metaLabel}>Start Date</Text><Text style={S.metaValue}>{fmtDate(batch.start_time)}</Text></View>
        </View>

        {/* Flask summary */}
        {flasks?.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
            {flasks.map(f => (
              <View key={f.id} style={{ flex: 1, padding: 6, backgroundColor: f.status === 'rejected' ? '#fef2f2' : C.gray100, borderRadius: 4, borderLeftWidth: 2, borderLeftColor: f.status === 'rejected' ? C.red : f.status === 'complete' ? C.emerald : C.navy }}>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy }}>{f.flask_label}</Text>
                <Text style={{ fontSize: 7, color: C.gray500 }}>{f.status}</Text>
              </View>
            ))}
          </View>
        )}

        {/* §1 Media Prep */}
        <View style={S.section}>
          <SectionHdr num="§1" title="Media Preparation" status={mediaPrepData?.is_complete ? 'Complete' : 'Incomplete'} />
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
                  {mediaPrepData.kavuni_weight_g && <Meta label="Kavuni Weight (g)" value={mediaPrepData.kavuni_weight_g} />}
                  {mediaPrepData.kavuni_precook_temp_c && <Meta label="Kavuni Pre-cook Temp" value={`${mediaPrepData.kavuni_precook_temp_c}°C`} />}
                  {mediaPrepData.kavuni_precook_min && <Meta label="Kavuni Pre-cook Time" value={`${mediaPrepData.kavuni_precook_min} min`} />}
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
          <SectionHdr num="§2" title="Sterilisation" status={sterilisationData?.pass_fail} />
          <View style={S.sectionBody}>
            {!sterilisationData ? <Text style={S.noteText}>No sterilisation data recorded.</Text> : (
              <>
                <View style={S.dataGrid}>
                  <Meta label="Method" value={sterilisationData.method} />
                  <Meta label="Cycle Temp (°C)" value={sterilisationData.cycle_temp_c} ccp />
                  <Meta label="Cycle Pressure" value={sterilisationData.cycle_pressure} ccp />
                  <Meta label="Hold Time (min)" value={sterilisationData.hold_time_min} ccp />
                  <Meta label="Cycle Start" value={fmt(sterilisationData.cycle_start)} />
                  <Meta label="Cycle End" value={fmt(sterilisationData.cycle_end)} />
                  <Meta label="Autoclave Tape" value={sterilisationData.autoclave_tape} />
                  <Meta label="Overall Result" value={sterilisationData.pass_fail} />
                </View>
                {sterilisationData.pass_fail === 'Fail' && (
                  <View style={S.alertStrip}><Text style={S.alertText}>🚨 CRITICAL: Sterilisation FAILED. Batch should not have been inoculated — raise CAPA immediately.</Text></View>
                )}
                {sterilisationData.notes && <View style={S.noteBox}><Text style={S.noteText}>{sterilisationData.notes}</Text></View>}
              </>
            )}
          </View>
        </View>

        <View style={S.footer} fixed>
          <Text style={S.footerText}>Oxygen Bioinnovations · BMR {batch.batch_id} · Generated: {fmtDate(generatedAt)} · {generatedBy}</Text>
          <Text style={S.footerText}>CONFIDENTIAL — GMP Document · Do not reproduce without authorisation</Text>
          <Text style={S.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* ═══════════════════════════════════════════════════
          PAGE 2 — Inoculation + Fermentation
      ════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>

        {/* §3 Inoculation */}
        <View style={S.section}>
          <SectionHdr num="§3" title="Inoculation" status={inoculationData?.t_zero_time ? 'Complete' : 'Incomplete'} />
          <View style={S.sectionBody}>
            {!inoculationData ? <Text style={S.noteText}>No inoculation data recorded.</Text> : (
              <>
                <View style={S.dataGrid}>
                  <Meta label="Inoculum Type" value={inoculationData.inoculum_type} />
                  {inoculationData.backslop_source_batch && <Meta label="Back-slop Source" value={inoculationData.backslop_source_batch} />}
                  <Meta label="Inoculum Volume (ml)" value={inoculationData.inoculum_vol_ml} ccp />
                  <Meta label="Inoculation Rate" value={inoculationData.inoculation_pct ? `${inoculationData.inoculation_pct}% v/v` : '—'} />
                  <Meta label="Substrate Temp (°C)" value={inoculationData.inoculation_temp_c} ccp />
                  <Meta label="Transfer Method" value={inoculationData.transfer_method} />
                  <Meta label="LAF Cabinet" value={inoculationData.laf_used ? 'Yes' : 'No'} />
                  <Meta label="Contamination Check" value={inoculationData.contamination_check} />
                </View>
                <View style={[S.ccpCell, { marginBottom: 4 }]}>
                  <Text style={S.ccpLabel}>T=0 — FERMENTATION ANCHOR ★ CCP</Text>
                  <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.navy }}>{fmt(inoculationData.t_zero_time)}</Text>
                </View>
                {inoculationData.contamination_check === 'Suspected' && (
                  <View style={S.alertStrip}><Text style={S.alertText}>⚠ Contamination suspected at inoculation. Review flask dispositions and endpoint data.</Text></View>
                )}
                {inoculationData.notes && <View style={S.noteBox}><Text style={S.noteText}>{inoculationData.notes}</Text></View>}
              </>
            )}
          </View>
        </View>

        {/* §4 Fermentation */}
        <View style={S.section}>
          <SectionHdr num="§4" title={`Fermentation — ${totalReadings} readings · ${alarmReadings} alarms`} status={fermentationEndpoint ? 'Endpoint Declared' : 'In Progress'} />
          <View style={S.sectionBody}>
            {fermentationEndpoint && (
              <>
                <View style={S.dataGrid}>
                  <Meta label="Total Duration (hr)" value={fermentationEndpoint.total_hours?.toFixed(2)} ccp />
                  <Meta label="Final pH" value={fermentationEndpoint.final_ph} ccp />
                  <Meta label="pH Out of Range" value={fermentationEndpoint.ph_out_of_range ? 'YES' : 'No'} />
                  <Meta label="Aroma" value={fermentationEndpoint.aroma} />
                  <Meta label="Colour" value={fermentationEndpoint.colour_desc} />
                  <Meta label="Texture" value={fermentationEndpoint.texture} />
                  <Meta label="Sensory Overall" value={fermentationEndpoint.sensory_overall} />
                  <Meta label="Gram Stain" value={fermentationEndpoint.gram_stain} />
                </View>
                {fermentationEndpoint.ph_out_of_range && (
                  <View style={S.warnStrip}><Text style={S.warnText}>⚠ Final pH outside target range (4.2–4.5) — deviation acknowledged at declaration.</Text></View>
                )}
              </>
            )}

            {/* Reading summary table — most recent 15 only to keep concise */}
            {fermentationReadings?.length > 0 && (
              <View style={S.table}>
                <View style={S.tableHead}>
                  <Text style={[S.tableHCell, { flex: 0.6 }]}>Flask</Text>
                  <Text style={[S.tableHCell, { flex: 0.8 }]}>T+ (hr)</Text>
                  <Text style={[S.tableHCell, { flex: 0.8 }]}>pH ★CCP</Text>
                  <Text style={[S.tableHCell, { flex: 0.8 }]}>Temp ★CCP</Text>
                  <Text style={[S.tableHCell, { flex: 1 }]}>Foam</Text>
                  <Text style={[S.tableHCell, { flex: 0.5 }]}>Alarm</Text>
                </View>
                {fermentationReadings.slice(0, 20).map((r, i) => (
                  <View key={r.id} style={[S.tableRow, (r.is_ph_alarm || r.is_temp_alarm) && S.tableAlarm, i % 2 === 1 && !r.is_ph_alarm && !r.is_temp_alarm && S.tableRowAlt]}>
                    <Text style={[S.tableDCell, { flex: 0.6, fontFamily: 'Helvetica-Bold' }]}>{r.flask_label || 'All'}</Text>
                    <Text style={[S.tableDCell, { flex: 0.8 }]}>T+{r.elapsed_hours?.toFixed(1)}h</Text>
                    <Text style={[S.tableDCell, { flex: 0.8, fontFamily: 'Helvetica-Bold', color: r.is_ph_alarm ? C.red : C.gray900 }]}>{r.ph}</Text>
                    <Text style={[S.tableDCell, { flex: 0.8, color: r.is_temp_alarm ? C.red : C.gray700 }]}>{r.incubator_temp_c ? `${r.incubator_temp_c}°C` : '—'}</Text>
                    <Text style={[S.tableDCell, { flex: 1 }]}>{r.foam_level}</Text>
                    <Text style={[S.tableDCell, { flex: 0.5, color: (r.is_ph_alarm || r.is_temp_alarm) ? C.red : C.gray500 }]}>{(r.is_ph_alarm || r.is_temp_alarm) ? '⚠' : '✓'}</Text>
                  </View>
                ))}
                {fermentationReadings.length > 20 && (
                  <View style={{ padding: 4, backgroundColor: C.gray100 }}>
                    <Text style={{ fontSize: 7, color: C.gray500 }}>...and {fermentationReadings.length - 20} more readings (see digital records in OxyOS)</Text>
                  </View>
                )}
              </View>
            )}
            {!fermentationReadings?.length && <Text style={S.noteText}>No readings logged.</Text>}
            {fermentationEndpoint?.notes && <View style={S.noteBox}><Text style={S.noteText}>{fermentationEndpoint.notes}</Text></View>}
          </View>
        </View>

        <View style={S.footer} fixed>
          <Text style={S.footerText}>Oxygen Bioinnovations · BMR {batch.batch_id} · Generated: {fmtDate(generatedAt)} · {generatedBy}</Text>
          <Text style={S.footerText}>CONFIDENTIAL — GMP Document · Do not reproduce without authorisation</Text>
          <Text style={S.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* ═══════════════════════════════════════════════════
          PAGE 3 — Straining + Extract + QC + Release
      ════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>

        {/* §5 Straining */}
        <View style={S.section}>
          <SectionHdr num="§5" title="Straining / Separation" status={strainingData ? 'Complete' : 'Incomplete'} />
          <View style={S.sectionBody}>
            {!strainingData ? <Text style={S.noteText}>No straining data recorded.</Text> : (
              <>
                <View style={S.dataGrid}>
                  <Meta label="Method" value={strainingData.method} />
                  <Meta label="Pre-straining Vol (ml)" value={strainingData.pre_straining_vol_ml} />
                  <Meta label="Post-straining Vol (ml)" value={strainingData.post_straining_vol_ml} ccp />
                  <Meta label="Recovery %" value={strainingData.recovery_pct ? `${strainingData.recovery_pct}%` : '—'} />
                  <Meta label="Temperature" value={strainingData.straining_temp} />
                  <Meta label="Filtrate pH" value={strainingData.filtrate_ph} ccp />
                  <Meta label="Filtrate Colour" value={strainingData.filtrate_colour} />
                  <Meta label="Filtrate Clarity" value={strainingData.filtrate_clarity} />
                </View>
                {strainingData.notes && <View style={S.noteBox}><Text style={S.noteText}>{strainingData.notes}</Text></View>}
              </>
            )}
          </View>
        </View>

        {/* §6 Extract Addition */}
        <View style={S.section}>
          <SectionHdr num="§6" title="Mushroom Extract Addition" status={extractData ? 'Complete' : 'Incomplete'} />
          <View style={S.sectionBody}>
            {!extractData ? <Text style={S.noteText}>No extract addition data recorded.</Text> : (
              <>
                <View style={S.dataGrid}>
                  <Meta label="Species" value={extractData.mushroom_species} />
                  <Meta label="Weight Used (g)" value={extractData.mushroom_weight_g} />
                  <Meta label="Extraction Water (ml)" value={extractData.extraction_water_ml} />
                  <Meta label="Extraction Temp (°C)" value={extractData.extraction_temp_c} />
                  <Meta label="Duration (min)" value={extractData.extraction_duration_min} />
                  <Meta label="Extract Recovered (ml)" value={extractData.extract_recovered_ml} />
                  <Meta label="Extract pH" value={extractData.extract_ph} />
                  <Meta label="pH Adjustment" value={extractData.ph_adjustment_done ? 'Yes' : 'No'} />
                  <Meta label="Volume Added (ml)" value={extractData.extract_vol_added_ml} />
                  <Meta label="Addition %" value={extractData.addition_pct ? `${extractData.addition_pct}%` : '—'} />
                  <Meta label="Final Product pH" value={extractData.final_product_ph} ccp />
                  <Meta label="Colour Before" value={extractData.colour_before} />
                  <Meta label="Colour After" value={extractData.colour_after} />
                </View>
                {extractData.final_product_ph > 5.0 && (
                  <View style={S.alertStrip}><Text style={S.alertText}>⚠ Final pH {extractData.final_product_ph} exceeds 5.0 — CEO override recorded.</Text></View>
                )}
              </>
            )}
          </View>
        </View>

        {/* §7 QC */}
        <View style={S.section}>
          <SectionHdr num="§7" title="Quality Control" status={qcTests?.every(t => t.pass_fail !== 'Pending') ? (qcTests.some(t => t.pass_fail === 'Fail') ? 'Fail' : 'Pass') : 'Pending'} />
          <View style={S.sectionBody}>
            {!qcSample ? <Text style={S.noteText}>No QC sample created.</Text> : (
              <>
                <View style={S.dataGrid}>
                  <Meta label="Sample ID" value={qcSample.sample_id} />
                  <Meta label="Sampling Date" value={fmtDate(qcSample.sampling_date)} />
                  <Meta label="Testing Location" value={qcSample.testing_location} />
                  {qcSample.external_lab && <Meta label="External Lab" value={qcSample.external_lab} />}
                </View>
                <View style={S.table}>
                  <View style={S.tableHead}>
                    <Text style={[S.tableHCell, { flex: 2 }]}>Test</Text>
                    <Text style={[S.tableHCell, { flex: 1.5 }]}>Target</Text>
                    <Text style={[S.tableHCell, { flex: 1 }]}>Result</Text>
                    <Text style={[S.tableHCell, { flex: 0.6 }]}>Unit</Text>
                    <Text style={[S.tableHCell, { flex: 0.7 }]}>P/F</Text>
                  </View>
                  {qcTests?.map((t, i) => (
                    <View key={t.id} style={[S.tableRow, t.pass_fail === 'Fail' && S.tableAlarm, i % 2 === 1 && t.pass_fail !== 'Fail' && S.tableRowAlt]}>
                      <Text style={[S.tableDCell, { flex: 2, fontFamily: 'Helvetica-Bold' }]}>{t.test_name}</Text>
                      <Text style={[S.tableDCell, { flex: 1.5 }]}>{t.target_spec}</Text>
                      <Text style={[S.tableDCell, { flex: 1 }]}>{t.result_value || '—'}</Text>
                      <Text style={[S.tableDCell, { flex: 0.6 }]}>{t.result_unit || '—'}</Text>
                      <View style={{ flex: 0.7 }}><PF v={t.pass_fail} /></View>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        </View>

        {/* §8 Disposition */}
        <View style={S.section}>
          <SectionHdr num="§8" title={`Batch Disposition — ${batch.status?.toUpperCase()}`} status={batch.status === 'released' ? 'Released' : batch.status === 'rejected' ? 'Rejected' : 'Pending'} />
          <View style={S.sectionBody}>
            {isReleased && releaseRecord && (
              <View style={S.dataGrid}>
                <Meta label="Final Volume (ml)" value={releaseRecord.final_volume_ml} />
                <Meta label="Storage Condition" value={releaseRecord.storage_condition} />
                <Meta label="Storage Location" value={releaseRecord.storage_location} />
                {releaseRecord.release_notes && <View style={S.noteBox}><Text style={S.noteText}>{releaseRecord.release_notes}</Text></View>}
              </View>
            )}
            {isRejected && rejectionRecord && (
              <>
                <View style={[S.alertStrip, { marginBottom: 6 }]}><Text style={S.alertText}>BATCH REJECTED</Text></View>
                <View style={S.dataGrid}>
                  <Meta label="Rejected at Stage" value={rejectionRecord.rejection_stage?.replace(/_/g, ' ')} />
                  <Meta label="Disposal Method" value={rejectionRecord.disposal_method} />
                  <Meta label="Write-off Volume (ml)" value={rejectionRecord.write_off_vol_ml} />
                  <Meta label="CAPA Required" value={rejectionRecord.capa_required ? 'YES' : 'No'} />
                </View>
                <View style={S.noteBox}><Text style={[S.noteText, { fontFamily: 'Helvetica-Bold' }]}>Rejection Reason:</Text><Text style={S.noteText}>{rejectionRecord.rejection_reason}</Text></View>
              </>
            )}
          </View>
        </View>

        {/* Signature Block */}
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

        <View style={S.footer} fixed>
          <Text style={S.footerText}>Oxygen Bioinnovations · BMR {batch.batch_id} · Generated: {fmtDate(generatedAt)} · {generatedBy}</Text>
          <Text style={S.footerText}>CONFIDENTIAL — GMP Document · Do not reproduce without authorisation</Text>
          <Text style={S.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
