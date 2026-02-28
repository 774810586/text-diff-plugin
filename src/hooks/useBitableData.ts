import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { bitable, FieldType, IFieldMeta, ITable } from '@lark-base-open/js-sdk';

export interface FieldOption { label: string; value: string; }
export interface RecordPair {
  recordId: string;
  gtText: string;
  aiText: string;
  searchableValues: Record<string, string>; // fieldId -> text value
}

export function useBitableData() {
  const [loading, setLoading] = useState(false);
  const [fieldOptions, setFieldOptions] = useState<FieldOption[]>([]);
  const [allFieldOptions, setAllFieldOptions] = useState<FieldOption[]>([]);
  const [gtFieldId, setGtFieldId] = useState<string | undefined>();
  const [aiFieldId, setAiFieldId] = useState<string | undefined>();
  const [records, setRecords] = useState<RecordPair[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchFieldId, setSearchFieldId] = useState<string | undefined>();
  const [searchValue, setSearchValue] = useState('');
  const tableRef = useRef<ITable | null>(null);
  const allFieldMetaRef = useRef<IFieldMeta[]>([]);

  const loadFields = useCallback(async () => {
    try {
      const table = await bitable.base.getActiveTable();
      tableRef.current = table;
      const fieldMetaList: IFieldMeta[] = await table.getFieldMetaList();
      allFieldMetaRef.current = fieldMetaList;

      // 文本字段用于 GT/AI 选择
      const textFields = fieldMetaList.filter((f) => f.type === FieldType.Text);
      setFieldOptions(textFields.map((f) => ({ label: f.name, value: f.id })));

      // 所有字段用于搜索
      setAllFieldOptions(fieldMetaList.map((f) => ({ label: f.name, value: f.id })));
    } catch (err) { console.error('Failed to load fields:', err); }
  }, []);

  useEffect(() => {
    loadFields();
    let lastTableId = '';
    const off = bitable.base.onSelectionChange(async (event) => {
      const sel = event.data;
      if (sel.tableId && sel.tableId !== lastTableId) {
        lastTableId = sel.tableId;
        setGtFieldId(undefined); setAiFieldId(undefined);
        setRecords([]); setCurrentIndex(0);
        setSearchFieldId(undefined); setSearchValue('');
        loadFields();
      }
    });
    return () => { if (typeof off === 'function') off(); };
  }, [loadFields]);

  const extractText = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.map((seg: any) => seg.text || '').join('');
    return String(val);
  };

  const loadRecords = useCallback(async () => {
    if (!gtFieldId || !aiFieldId || !tableRef.current) { setRecords([]); return; }
    setLoading(true);
    try {
      const table = tableRef.current;
      const recordIdList = await table.getRecordIdList();
      const pairs: RecordPair[] = [];
      const batchSize = 200;

      // 收集需要读取的搜索字段
      const searchableFieldIds = allFieldMetaRef.current.map(f => f.id);

      for (let i = 0; i < recordIdList.length; i += batchSize) {
        const batchIds = recordIdList.slice(i, i + batchSize);
        const batchResults = await Promise.all(batchIds.map(async (recordId) => {
          const [gtVal, aiVal] = await Promise.all([
            table.getCellValue(gtFieldId, recordId),
            table.getCellValue(aiFieldId, recordId),
          ]);

          // 读取所有字段的值用于搜索
          const searchableValues: Record<string, string> = {};
          await Promise.all(searchableFieldIds.map(async (fid) => {
            try {
              const val = await table.getCellValue(fid, recordId);
              searchableValues[fid] = extractText(val);
            } catch { searchableValues[fid] = ''; }
          }));

          return {
            recordId,
            gtText: extractText(gtVal),
            aiText: extractText(aiVal),
            searchableValues,
          };
        }));
        pairs.push(...batchResults);
      }
      setRecords(pairs); setCurrentIndex(0);
    } catch (err) { console.error('Failed to load records:', err); }
    finally { setLoading(false); }
  }, [gtFieldId, aiFieldId]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  // 搜索过滤
  const filteredRecords = useMemo(() => {
    if (!searchValue.trim()) return records;
    const keyword = searchValue.trim().toLowerCase();
    return records.filter((r) => {
      if (searchFieldId) {
        return (r.searchableValues[searchFieldId] || '').toLowerCase().includes(keyword);
      }
      // 无指定列时搜索所有字段
      return Object.values(r.searchableValues).some(v => v.toLowerCase().includes(keyword));
    });
  }, [records, searchFieldId, searchValue]);

  // 搜索结果变化时重置索引
  useEffect(() => {
    setCurrentIndex(0);
  }, [filteredRecords.length]);

  // 监听选中记录
  useEffect(() => {
    const offSelection = bitable.base.onSelectionChange((event) => {
      const sel = event.data;
      if (sel.recordId && filteredRecords.length > 0) {
        const idx = filteredRecords.findIndex((r) => r.recordId === sel.recordId);
        if (idx >= 0) setCurrentIndex(idx);
      }
    });
    return () => { if (typeof offSelection === 'function') offSelection(); };
  }, [filteredRecords]);

  return {
    loading, fieldOptions, allFieldOptions,
    gtFieldId, setGtFieldId, aiFieldId, setAiFieldId,
    records, currentIndex, setCurrentIndex, reload: loadRecords,
    searchFieldId, setSearchFieldId, searchValue, setSearchValue,
    filteredRecords,
  };
}
