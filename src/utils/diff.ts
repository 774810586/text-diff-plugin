import { diffLines, diffWords, Change } from 'diff';

export type DiffMode = 'char' | 'word' | 'line' | 'sql';

export interface DiffStats {
  totalChars: number;
  addedChars: number;
  removedChars: number;
  unchangedChars: number;
  similarity: number;
}

// ========== 行级 Diff 结果 ==========
export type LineType = 'equal' | 'added' | 'removed' | 'modified';

export interface WordSpan {
  text: string;
  type: 'equal' | 'added' | 'removed';
}

export interface DiffLine {
  lineType: LineType;
  leftLine?: string;
  rightLine?: string;
  leftLineNo?: number;
  rightLineNo?: number;
  wordSpans?: WordSpan[]; // 行内词级 diff（用于 modified 行和 inline 视图）
}

export interface LineDiffResult {
  lines: DiffLine[];
  stats: DiffStats;
}

// ========== SQL 子句解析 ==========
const SQL_CLAUSE_REGEX =
  /\b(SELECT|FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|OUTER\s+JOIN|FULL\s+JOIN|CROSS\s+JOIN|ON|AND|OR|INSERT\s+INTO|VALUES|UPDATE|SET|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|UNION|UNION\s+ALL|WITH|AS)\b/gi;

interface SqlClause {
  keyword: string;
  body: string;
}

function parseSqlClauses(sql: string): SqlClause[] {
  const clauses: SqlClause[] = [];
  const matches: { index: number; keyword: string }[] = [];

  let m: RegExpExecArray | null;
  const regex = new RegExp(SQL_CLAUSE_REGEX.source, 'gi');
  while ((m = regex.exec(sql)) !== null) {
    matches.push({ index: m.index, keyword: m[0].toUpperCase().replace(/\s+/g, ' ') });
  }

  if (matches.length === 0) {
    return [{ keyword: '', body: sql }];
  }

  // 如果 SQL 在第一个关键词前有内容
  if (matches[0].index > 0) {
    clauses.push({ keyword: '', body: sql.slice(0, matches[0].index).trim() });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : sql.length;
    const fullText = sql.slice(start, end).trim();
    const keyword = matches[i].keyword;
    const body = fullText.slice(matches[i].keyword.length).trim();
    clauses.push({ keyword, body });
  }

  return clauses;
}

// ========== 词级 Diff ==========
function computeWordSpans(leftText: string, rightText: string): WordSpan[] {
  const changes = diffWords(leftText, rightText);
  return changes.map((c) => ({
    text: c.value,
    type: c.added ? 'added' : c.removed ? 'removed' : 'equal',
  }));
}

// ========== 行级 Diff（带行内词级高亮）==========
export function computeLineDiff(gtText: string, aiText: string): LineDiffResult {
  const lineChanges = diffLines(gtText, aiText);

  const lines: DiffLine[] = [];
  let leftNo = 0;
  let rightNo = 0;

  // 先收集所有连续的 removed/added 块进行配对
  let i = 0;
  while (i < lineChanges.length) {
    const change = lineChanges[i];

    if (!change.added && !change.removed) {
      // equal
      const eqLines = splitIntoLines(change.value);
      for (const line of eqLines) {
        leftNo++;
        rightNo++;
        lines.push({
          lineType: 'equal',
          leftLine: line,
          rightLine: line,
          leftLineNo: leftNo,
          rightLineNo: rightNo,
        });
      }
      i++;
    } else {
      // 收集连续的 removed + added 块
      let removedText = '';
      let addedText = '';

      while (i < lineChanges.length && (lineChanges[i].added || lineChanges[i].removed)) {
        if (lineChanges[i].removed) removedText += lineChanges[i].value;
        if (lineChanges[i].added) addedText += lineChanges[i].value;
        i++;
      }

      const removedLines = splitIntoLines(removedText);
      const addedLines = splitIntoLines(addedText);

      // 配对：取 min 长度做 modified，剩余做纯 added/removed
      const paired = Math.min(removedLines.length, addedLines.length);

      for (let j = 0; j < paired; j++) {
        leftNo++;
        rightNo++;
        const wordSpans = computeWordSpans(removedLines[j], addedLines[j]);
        lines.push({
          lineType: 'modified',
          leftLine: removedLines[j],
          rightLine: addedLines[j],
          leftLineNo: leftNo,
          rightLineNo: rightNo,
          wordSpans,
        });
      }

      // 多出的 removed
      for (let j = paired; j < removedLines.length; j++) {
        leftNo++;
        lines.push({
          lineType: 'removed',
          leftLine: removedLines[j],
          leftLineNo: leftNo,
        });
      }

      // 多出的 added
      for (let j = paired; j < addedLines.length; j++) {
        rightNo++;
        lines.push({
          lineType: 'added',
          rightLine: addedLines[j],
          rightLineNo: rightNo,
        });
      }
    }
  }

  // 统计
  let addedChars = 0, removedChars = 0, unchangedChars = 0;
  for (const line of lines) {
    if (line.lineType === 'equal') {
      unchangedChars += (line.leftLine || '').length;
    } else if (line.lineType === 'added') {
      addedChars += (line.rightLine || '').length;
    } else if (line.lineType === 'removed') {
      removedChars += (line.leftLine || '').length;
    } else if (line.lineType === 'modified' && line.wordSpans) {
      for (const s of line.wordSpans) {
        if (s.type === 'equal') unchangedChars += s.text.length;
        else if (s.type === 'added') addedChars += s.text.length;
        else removedChars += s.text.length;
      }
    }
  }

  const totalChars = Math.max(gtText.length, aiText.length, 1);
  const similarity = Math.min(Math.round((unchangedChars / totalChars) * 100), 100);

  return {
    lines,
    stats: { totalChars, addedChars, removedChars, unchangedChars, similarity },
  };
}

// ========== SQL 语法感知 Diff ==========
export function computeSqlDiff(gtText: string, aiText: string): LineDiffResult {
  const gtClauses = parseSqlClauses(gtText);
  const aiClauses = parseSqlClauses(aiText);

  const allKeywords = new Set<string>();
  gtClauses.forEach((c) => allKeywords.add(c.keyword));
  aiClauses.forEach((c) => allKeywords.add(c.keyword));

  const gtMap = new Map<string, string>();
  const aiMap = new Map<string, string>();
  // 保留顺序，同关键字的多次出现合并
  for (const c of gtClauses) {
    gtMap.set(c.keyword, (gtMap.get(c.keyword) || '') + ' ' + c.body);
  }
  for (const c of aiClauses) {
    aiMap.set(c.keyword, (aiMap.get(c.keyword) || '') + ' ' + c.body);
  }

  const lines: DiffLine[] = [];
  let leftNo = 0;
  let rightNo = 0;

  // 按出现顺序遍历
  const orderedKeys: string[] = [];
  const seenKeys = new Set<string>();
  for (const c of [...gtClauses, ...aiClauses]) {
    if (!seenKeys.has(c.keyword)) {
      seenKeys.add(c.keyword);
      orderedKeys.push(c.keyword);
    }
  }

  for (const key of orderedKeys) {
    const gtBody = (gtMap.get(key) || '').trim();
    const aiBody = (aiMap.get(key) || '').trim();

    const prefix = key ? key + ' ' : '';

    if (gtBody === aiBody) {
      leftNo++;
      rightNo++;
      lines.push({
        lineType: 'equal',
        leftLine: prefix + gtBody,
        rightLine: prefix + aiBody,
        leftLineNo: leftNo,
        rightLineNo: rightNo,
      });
    } else if (!gtBody) {
      rightNo++;
      lines.push({
        lineType: 'added',
        rightLine: prefix + aiBody,
        rightLineNo: rightNo,
      });
    } else if (!aiBody) {
      leftNo++;
      lines.push({
        lineType: 'removed',
        leftLine: prefix + gtBody,
        leftLineNo: leftNo,
      });
    } else {
      leftNo++;
      rightNo++;
      const wordSpans = computeWordSpans(prefix + gtBody, prefix + aiBody);
      lines.push({
        lineType: 'modified',
        leftLine: prefix + gtBody,
        rightLine: prefix + aiBody,
        leftLineNo: leftNo,
        rightLineNo: rightNo,
        wordSpans,
      });
    }
  }

  let addedChars = 0, removedChars = 0, unchangedChars = 0;
  for (const line of lines) {
    if (line.lineType === 'equal') unchangedChars += (line.leftLine || '').length;
    else if (line.lineType === 'added') addedChars += (line.rightLine || '').length;
    else if (line.lineType === 'removed') removedChars += (line.leftLine || '').length;
    else if (line.lineType === 'modified' && line.wordSpans) {
      for (const s of line.wordSpans) {
        if (s.type === 'equal') unchangedChars += s.text.length;
        else if (s.type === 'added') addedChars += s.text.length;
        else removedChars += s.text.length;
      }
    }
  }

  const totalChars = Math.max(gtText.length, aiText.length, 1);
  const similarity = Math.min(Math.round((unchangedChars / totalChars) * 100), 100);

  return {
    lines,
    stats: { totalChars, addedChars, removedChars, unchangedChars, similarity },
  };
}

// ========== 辅助 ==========
function splitIntoLines(text: string): string[] {
  if (!text) return [];
  // 移除末尾换行后分割
  const trimmed = text.replace(/\n$/, '');
  if (!trimmed) return [];
  return trimmed.split('\n');
}

/** 自动检测是否为 SQL */
export function isSqlLike(text: string): boolean {
  const upper = text.toUpperCase().trim();
  return /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\b/i.test(upper);
}
