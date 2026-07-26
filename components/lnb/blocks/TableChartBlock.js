import React, { useState, useMemo } from 'react';
import { Table, Plus, Trash2, BarChart2, Settings, TrendingUp, ScatterChart } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, ScatterChart as ReScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function TableChartBlock({ block, updateBlock, canEdit }) {
  const content = block.content || {};
  const data = content.data || [
    ['Header 1', 'Header 2', 'Header 3'],
    ['Row 1', '10', '20'],
    ['Row 2', '15', '25'],
  ];
  const chartConfig = content.chartConfig || { show: false, type: 'line', xAxisIndex: 0, seriesIndices: [1, 2] };
  const hasColHeaders = content.hasColHeaders ?? true;

  const updateData = (newData) => {
    updateBlock(block.id, { content: { ...content, data: newData } });
  };

  const updateChartConfig = (newConfig) => {
    updateBlock(block.id, { content: { ...content, chartConfig: { ...chartConfig, ...newConfig } } });
  };

  // --- Table Operations ---
  const handleCellChange = (r, c, val) => {
    const newData = data.map((row, i) => i === r ? row.map((cell, j) => j === c ? val : cell) : row);
    updateData(newData);
  };

  const addRow = (index) => {
    const newRow = new Array(data[0].length).fill('');
    const newData = [...data];
    newData.splice(index, 0, newRow);
    updateData(newData);
  };

  const deleteRow = (index) => {
    if (data.length <= 1) return;
    const newData = [...data];
    newData.splice(index, 1);
    updateData(newData);
  };

  const addColumn = (index) => {
    const newData = data.map(row => {
      const newRow = [...row];
      newRow.splice(index, 0, '');
      return newRow;
    });
    updateData(newData);
  };

  const deleteColumn = (index) => {
    if (data[0].length <= 1) return;
    const newData = data.map(row => {
      const newRow = [...row];
      newRow.splice(index, 1);
      return newRow;
    });
    updateData(newData);
  };

  // --- Chart Parsing ---
  const chartData = useMemo(() => {
    if (data.length < 2) return [];
    const rowsToParse = hasColHeaders ? data.slice(1) : data;
    return rowsToParse.map((row, i) => {
      const obj = { _name: row[chartConfig.xAxisIndex] || `Row ${i+1}` };
      chartConfig.seriesIndices.forEach(colIndex => {
        const val = parseFloat(row[colIndex]);
        obj[`col_${colIndex}`] = isNaN(val) ? 0 : val;
      });
      return obj;
    });
  }, [data, chartConfig, hasColHeaders]);

  const seriesColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const renderChart = () => {
    if (!chartConfig.show || chartConfig.seriesIndices.length === 0) return null;

    const seriesNames = chartConfig.seriesIndices.map(colIndex => 
      hasColHeaders ? (data[0][colIndex] || `Column ${colIndex+1}`) : `Column ${colIndex+1}`
    );

    const ChartComponent = chartConfig.type === 'bar' ? BarChart : chartConfig.type === 'scatter' ? ReScatterChart : LineChart;

    return (
      <div className="mt-6 h-80 w-full bg-slate-50 rounded-xl p-4 border border-slate-100">
        <ResponsiveContainer width="100%" height="100%">
          <ChartComponent data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="_name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-10} />
            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            {chartConfig.seriesIndices.map((colIndex, idx) => {
              const name = seriesNames[idx];
              const color = seriesColors[idx % seriesColors.length];
              const key = `col_${colIndex}`;
              
              if (chartConfig.type === 'bar') {
                return <Bar key={key} dataKey={key} name={name} fill={color} radius={[4, 4, 0, 0]} />;
              }
              if (chartConfig.type === 'scatter') {
                return <Scatter key={key} dataKey={key} name={name} fill={color} />;
              }
              return <Line key={key} type="monotone" dataKey={key} name={name} stroke={color} strokeWidth={2} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />;
            })}
          </ChartComponent>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <div className="flex items-center gap-2">
          <Table className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-500 uppercase">Data Table & Chart</span>
        </div>
        
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateChartConfig({ show: !chartConfig.show })}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-colors ${chartConfig.show ? 'bg-slate-100 text-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <BarChart2 className="w-3.5 h-3.5" /> {chartConfig.show ? 'Hide Chart' : 'Show Chart'}
            </button>
            <button
              onClick={() => updateBlock(block.id, { content: { ...content, hasColHeaders: !hasColHeaders } })}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-colors ${hasColHeaders ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Header Row: {hasColHeaders ? 'ON' : 'OFF'}
            </button>
          </div>
        )}
      </div>
      
      <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden p-4 overflow-x-auto relative">
        <table className="w-full border-collapse">
          <tbody>
            {data.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className="p-0 border border-slate-200 relative group min-w-[120px]">
                    <input
                      type="text"
                      value={cell}
                      onChange={(e) => handleCellChange(r, c, e.target.value)}
                      readOnly={!canEdit}
                      className={`w-full p-2 outline-none text-sm transition-colors ${!canEdit ? 'bg-transparent' : 'focus:bg-slate-50'} ${hasColHeaders && r === 0 ? 'bg-slate-50 font-bold text-slate-700' : 'text-slate-600'}`}
                    />
                    
                    {canEdit && (
                      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
                        {r === 0 && <button onClick={() => deleteColumn(c)} className="p-1 bg-white border border-red-200 text-red-500 hover:bg-red-50 rounded shadow-sm" title="Delete column"><Trash2 className="w-3 h-3" /></button>}
                        {c === 0 && <button onClick={() => deleteRow(r)} className="p-1 bg-white border border-red-200 text-red-500 hover:bg-red-50 rounded shadow-sm" title="Delete row"><Trash2 className="w-3 h-3" /></button>}
                      </div>
                    )}
                  </td>
                ))}
                {canEdit && r === 0 && (
                   <td rowSpan={data.length} className="w-10 p-2 align-top border-none bg-transparent">
                     <button onClick={() => addColumn(data[0].length)} className="p-1.5 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded border border-slate-200 transition-colors shadow-sm flex items-center justify-center w-full h-full min-h-[36px]" title="Add Column">
                       <Plus className="w-4 h-4" />
                     </button>
                   </td>
                )}
              </tr>
            ))}
            {canEdit && (
              <tr>
                <td colSpan={data[0].length} className="p-2 border-none">
                  <button onClick={() => addRow(data.length)} className="flex items-center justify-center gap-1 w-full p-2 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded border border-slate-200 font-bold text-xs transition-colors shadow-sm">
                    <Plus className="w-4 h-4" /> Add Row
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {canEdit && chartConfig.show && (
          <div className="mt-4 p-4 bg-slate-50/50 rounded-lg border border-slate-100">
            <h4 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider flex items-center gap-1.5"><Settings className="w-3.5 h-3.5" /> Chart Configuration</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Chart Type</label>
                <div className="flex bg-white rounded-lg border border-slate-200 overflow-hidden">
                  {[
                    { type: 'line', icon: TrendingUp },
                    { type: 'bar', icon: BarChart2 },
                    { type: 'scatter', icon: ScatterChart }
                  ].map(({ type, icon: Icon }) => (
                    <button
                      key={type}
                      onClick={() => updateChartConfig({ type })}
                      className={`flex-1 flex items-center justify-center py-1.5 transition-colors ${chartConfig.type === type ? 'bg-slate-50 text-slate-700 font-bold' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">X-Axis Column</label>
                <select
                  value={chartConfig.xAxisIndex}
                  onChange={(e) => updateChartConfig({ xAxisIndex: parseInt(e.target.value) })}
                  className="w-full bg-white border border-slate-200 text-sm p-1.5 rounded-lg outline-none focus:border-slate-300"
                >
                  {data[0].map((col, idx) => (
                    <option key={idx} value={idx}>{hasColHeaders ? (col || `Column ${idx+1}`) : `Column ${idx+1}`}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Data Series (Y-Axis)</label>
                <div className="flex flex-wrap gap-1">
                  {data[0].map((col, idx) => {
                    if (idx === chartConfig.xAxisIndex) return null;
                    const isSelected = chartConfig.seriesIndices.includes(idx);
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          const newSeries = isSelected
                            ? chartConfig.seriesIndices.filter(i => i !== idx)
                            : [...chartConfig.seriesIndices, idx];
                          updateChartConfig({ seriesIndices: newSeries });
                        }}
                        className={`px-2 py-1 text-xs font-bold rounded border transition-colors ${isSelected ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                      >
                        {hasColHeaders ? (col || `Col ${idx+1}`) : `Col ${idx+1}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {renderChart()}
      </div>
    </div>
  );
}
