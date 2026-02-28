import React, { useState, useMemo } from 'react';
import { Select, Button, Input, Spin, Switch } from '@arco-design/web-react';
import { useTheme } from './hooks/useTheme';
import { useBitableData } from './hooks/useBitableData';
import { DiffMode, computeLineDiff, computeSqlDiff, isSqlLike } from './utils/diff';
import DiffView from './components/DiffView';

type ViewMode = 'unified' | 'side-by-side';

export default function App() {
  useTheme();

  const {
    loading, fieldOptions, allFieldOptions,
    gtFieldId, setGtFieldId, aiFieldId, setAiFieldId,
    currentIndex, setCurrentIndex,
    searchFieldId, setSearchFieldId, searchValue, setSearchValue,
    filteredRecords,
  } = useBitableData();

  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [diffMode, setDiffMode] = useState<DiffMode>('line');
  const [showDiff, setShowDiff] = useState(false);

  const displayRecords = filteredRecords;
  const currentRecord = displayRecords[currentIndex] ?? null;

  const stats = useMemo(() => {
    if (!currentRecord || !showDiff) return null;
    const useSql = diffMode === 'sql' ||
      (diffMode === 'line' && isSqlLike(currentRecord.gtText) && isSqlLike(currentRecord.aiText));
    const result = useSql
      ? computeSqlDiff(currentRecord.gtText, currentRecord.aiText)
      : computeLineDiff(currentRecord.gtText, currentRecord.aiText);
    return result.stats;
  }, [currentRecord, diffMode, showDiff]);

  // 自动检测当前文本是否为 SQL
  const currentIsSql = useMemo(() => {
    if (!currentRecord) return false;
    return isSqlLike(currentRecord.gtText) || isSqlLike(currentRecord.aiText);
  }, [currentRecord]);

  const goPrev = () => setCurrentIndex((i) => Math.max(0, i - 1));
  const goNext = () => setCurrentIndex((i) => Math.min(displayRecords.length - 1, i + 1));

  return (
    <div className="app-container">
      <div className="app-header">
        <div className="app-title">📝 长文本 Diff 对比</div>
      </div>

      {/* 字段选择并排 */}
      <div className="config-row-inline">
        <div className="config-cell">
          <div className="config-mini-label"><span className="dot dot-gt" />GT 字段</div>
          <Select placeholder="Ground Truth" size="small" style={{ width: '100%' }}
            options={fieldOptions} value={gtFieldId} onChange={(val) => setGtFieldId(val)} allowClear />
        </div>
        <div className="config-cell">
          <div className="config-mini-label"><span className="dot dot-ai" />AI 字段</div>
          <Select placeholder="AI 生成" size="small" style={{ width: '100%' }}
            options={fieldOptions} value={aiFieldId} onChange={(val) => setAiFieldId(val)} allowClear />
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="search-bar">
        <Select placeholder="搜索列" size="small" style={{ width: 140, flexShrink: 0 }}
          options={allFieldOptions} value={searchFieldId} onChange={(val) => setSearchFieldId(val)} allowClear />
        <Input placeholder="输入关键词搜索..." size="small" style={{ flex: 1 }}
          value={searchValue} onChange={(val) => setSearchValue(val)} allowClear />
        <span className="search-count">{displayRecords.length} 条</span>
      </div>

      {/* 加载/空状态 */}
      {loading && <div className="loading-container"><Spin size={20} /><span>加载中...</span></div>}
      {!loading && (!gtFieldId || !aiFieldId) && (
        <div className="empty-state"><div className="empty-icon">⚙️</div><div>请选择 GT 字段和 AI 字段</div></div>
      )}
      {!loading && gtFieldId && aiFieldId && displayRecords.length === 0 && (
        <div className="empty-state"><div className="empty-icon">📭</div>
          <div>{searchValue ? '未找到匹配记录' : '当前表中没有记录'}</div></div>
      )}

      {/* 有记录 */}
      {!loading && displayRecords.length > 0 && currentRecord && (
        <>
          <div className="nav-bar">
            <div className="nav-left">
              <Button size="mini" disabled={currentIndex <= 0} onClick={goPrev}>←</Button>
              <span className="nav-info">{currentIndex + 1} / {displayRecords.length}</span>
              <Button size="mini" disabled={currentIndex >= displayRecords.length - 1} onClick={goNext}>→</Button>
              {stats && (
                <span className={`nav-similarity ${stats.similarity >= 80 ? 'high' : 'low'}`}>
                  {stats.similarity}%
                </span>
              )}
            </div>
            <div className="nav-right">
              <div className="diff-toggle">
                <span className="diff-toggle-label">Diff</span>
                <Switch size="small" checked={showDiff} onChange={setShowDiff} />
              </div>
              {showDiff && (
                <>
                  <div className="view-btn-group">
                    <button className={`view-btn ${viewMode === 'unified' ? 'active' : ''}`}
                      onClick={() => setViewMode('unified')}>合并</button>
                    <button className={`view-btn ${viewMode === 'side-by-side' ? 'active' : ''}`}
                      onClick={() => setViewMode('side-by-side')}>并排</button>
                  </div>
                  <div className="view-btn-group">
                    <button className={`view-btn ${diffMode === 'line' ? 'active' : ''}`}
                      onClick={() => setDiffMode('line')}>行级</button>
                    {currentIsSql && (
                      <button className={`view-btn ${diffMode === 'sql' ? 'active' : ''}`}
                        onClick={() => setDiffMode('sql')}>SQL</button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="diff-content-wrapper">
            <DiffView
              gtText={currentRecord.gtText}
              aiText={currentRecord.aiText}
              diffMode={diffMode}
              viewMode={viewMode}
              showDiff={showDiff}
            />
          </div>
        </>
      )}
    </div>
  );
}
