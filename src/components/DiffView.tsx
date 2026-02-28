import React, { useMemo } from 'react';
import {
  DiffLine,
  WordSpan,
  DiffMode,
  computeLineDiff,
  computeSqlDiff,
  isSqlLike,
} from '../utils/diff';

type ViewMode = 'unified' | 'side-by-side';

interface DiffViewProps {
  gtText: string;
  aiText: string;
  diffMode: DiffMode;
  viewMode: ViewMode;
  showDiff: boolean;
}

// ========== 渲染 WordSpan ==========
function renderWordSpans(spans: WordSpan[]) {
  return spans.map((s, i) => {
    if (s.type === 'added') return <span key={i} className="ws-added">{s.text}</span>;
    if (s.type === 'removed') return <span key={i} className="ws-removed">{s.text}</span>;
    return <span key={i} className="ws-equal">{s.text}</span>;
  });
}

// ========== Unified (Inline Diff) 视图 ==========
function UnifiedDiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="diff-table">
      {lines.map((line, i) => {
        if (line.lineType === 'equal') {
          return (
            <div key={i} className="diff-row diff-row-equal">
              <div className="diff-gutter gutter-left">{line.leftLineNo}</div>
              <div className="diff-gutter gutter-right">{line.rightLineNo}</div>
              <div className="diff-marker">&nbsp;</div>
              <div className="diff-cell">{line.leftLine}</div>
            </div>
          );
        }
        if (line.lineType === 'removed') {
          return (
            <div key={i} className="diff-row diff-row-removed">
              <div className="diff-gutter gutter-left">{line.leftLineNo}</div>
              <div className="diff-gutter gutter-right"></div>
              <div className="diff-marker">−</div>
              <div className="diff-cell">{line.leftLine}</div>
            </div>
          );
        }
        if (line.lineType === 'added') {
          return (
            <div key={i} className="diff-row diff-row-added">
              <div className="diff-gutter gutter-left"></div>
              <div className="diff-gutter gutter-right">{line.rightLineNo}</div>
              <div className="diff-marker">+</div>
              <div className="diff-cell">{line.rightLine}</div>
            </div>
          );
        }
        // modified: 先显示删除行再显示新增行，行内词级高亮
        return (
          <React.Fragment key={i}>
            <div className="diff-row diff-row-modified-del">
              <div className="diff-gutter gutter-left">{line.leftLineNo}</div>
              <div className="diff-gutter gutter-right"></div>
              <div className="diff-marker">−</div>
              <div className="diff-cell">
                {line.wordSpans
                  ? line.wordSpans.filter(s => s.type !== 'added').map((s, j) => (
                      <span key={j} className={s.type === 'removed' ? 'ws-removed-inline' : 'ws-equal'}>
                        {s.text}
                      </span>
                    ))
                  : line.leftLine}
              </div>
            </div>
            <div className="diff-row diff-row-modified-add">
              <div className="diff-gutter gutter-left"></div>
              <div className="diff-gutter gutter-right">{line.rightLineNo}</div>
              <div className="diff-marker">+</div>
              <div className="diff-cell">
                {line.wordSpans
                  ? line.wordSpans.filter(s => s.type !== 'removed').map((s, j) => (
                      <span key={j} className={s.type === 'added' ? 'ws-added-inline' : 'ws-equal'}>
                        {s.text}
                      </span>
                    ))
                  : line.rightLine}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ========== Side-by-Side 视图 ==========
function SideBySideDiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="diff-sbs">
      <div className="diff-sbs-panel">
        <div className="diff-sbs-header"><span className="dot dot-gt" />Ground Truth</div>
        <div className="diff-sbs-body">
          {lines.map((line, i) => {
            if (line.lineType === 'equal') {
              return (
                <div key={i} className="sbs-row sbs-equal">
                  <span className="sbs-no">{line.leftLineNo}</span>
                  <span className="sbs-text">{line.leftLine}</span>
                </div>
              );
            }
            if (line.lineType === 'removed') {
              return (
                <div key={i} className="sbs-row sbs-removed">
                  <span className="sbs-no">{line.leftLineNo}</span>
                  <span className="sbs-text">{line.leftLine}</span>
                </div>
              );
            }
            if (line.lineType === 'added') {
              return (
                <div key={i} className="sbs-row sbs-placeholder">
                  <span className="sbs-no"></span>
                  <span className="sbs-text"></span>
                </div>
              );
            }
            // modified
            return (
              <div key={i} className="sbs-row sbs-modified">
                <span className="sbs-no">{line.leftLineNo}</span>
                <span className="sbs-text">
                  {line.wordSpans
                    ? line.wordSpans.filter(s => s.type !== 'added').map((s, j) => (
                        <span key={j} className={s.type === 'removed' ? 'ws-removed-inline' : 'ws-equal'}>
                          {s.text}
                        </span>
                      ))
                    : line.leftLine}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="diff-sbs-panel">
        <div className="diff-sbs-header"><span className="dot dot-ai" />AI 生成</div>
        <div className="diff-sbs-body">
          {lines.map((line, i) => {
            if (line.lineType === 'equal') {
              return (
                <div key={i} className="sbs-row sbs-equal">
                  <span className="sbs-no">{line.rightLineNo}</span>
                  <span className="sbs-text">{line.rightLine}</span>
                </div>
              );
            }
            if (line.lineType === 'added') {
              return (
                <div key={i} className="sbs-row sbs-added">
                  <span className="sbs-no">{line.rightLineNo}</span>
                  <span className="sbs-text">{line.rightLine}</span>
                </div>
              );
            }
            if (line.lineType === 'removed') {
              return (
                <div key={i} className="sbs-row sbs-placeholder">
                  <span className="sbs-no"></span>
                  <span className="sbs-text"></span>
                </div>
              );
            }
            // modified
            return (
              <div key={i} className="sbs-row sbs-modified">
                <span className="sbs-no">{line.rightLineNo}</span>
                <span className="sbs-text">
                  {line.wordSpans
                    ? line.wordSpans.filter(s => s.type !== 'removed').map((s, j) => (
                        <span key={j} className={s.type === 'added' ? 'ws-added-inline' : 'ws-equal'}>
                          {s.text}
                        </span>
                      ))
                    : line.rightLine}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ========== 纯文本视图（Diff 关闭时）==========
function PlainView({ gtText, aiText }: { gtText: string; aiText: string }) {
  return (
    <div className="diff-sbs">
      <div className="diff-sbs-panel">
        <div className="diff-sbs-header"><span className="dot dot-gt" />Ground Truth</div>
        <div className="diff-sbs-body">
          <div className="plain-text">{gtText || <em className="text-empty">（空）</em>}</div>
        </div>
      </div>
      <div className="diff-sbs-panel">
        <div className="diff-sbs-header"><span className="dot dot-ai" />AI 生成</div>
        <div className="diff-sbs-body">
          <div className="plain-text">{aiText || <em className="text-empty">（空）</em>}</div>
        </div>
      </div>
    </div>
  );
}

// ========== 主组件 ==========
export default function DiffView({ gtText, aiText, diffMode, viewMode, showDiff }: DiffViewProps) {
  const diffResult = useMemo(() => {
    // SQL 模式：自动检测或手动选择
    const useSql = diffMode === 'sql' || (diffMode === 'line' && isSqlLike(gtText) && isSqlLike(aiText));
    if (useSql) return computeSqlDiff(gtText, aiText);
    return computeLineDiff(gtText, aiText);
  }, [gtText, aiText, diffMode]);

  if (gtText === aiText) {
    return (
      <div className="perfect-match">
        <div className="perfect-match-icon">✓</div>
        <div>文本完全一致</div>
      </div>
    );
  }

  if (!showDiff) {
    return <PlainView gtText={gtText} aiText={aiText} />;
  }

  if (viewMode === 'unified') {
    return <UnifiedDiffView lines={diffResult.lines} />;
  }

  return <SideBySideDiffView lines={diffResult.lines} />;
}
