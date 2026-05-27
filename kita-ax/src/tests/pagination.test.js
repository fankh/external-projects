const { paginate, filter, search, sort, applyFilters } = require('../utils/pagination');

describe('Pagination Utilities', () => {
  const testData = [
    { id: 1, name: 'Alice', role: 'admin', status: 'active' },
    { id: 2, name: 'Bob', role: 'editor', status: 'active' },
    { id: 3, name: 'Charlie', role: 'viewer', status: 'inactive' },
    { id: 4, name: 'Diana', role: 'editor', status: 'active' },
    { id: 5, name: 'Eve', role: 'admin', status: 'active' }
  ];

  describe('paginate()', () => {
    it('should return first page by default', () => {
      const result = paginate(testData, 1, 2);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.total).toBe(5);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrev).toBe(false);
    });

    it('should return correct page when page > 1', () => {
      const result = paginate(testData, 2, 2);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe(3);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.hasPrev).toBe(true);
    });

    it('should handle last page with fewer items', () => {
      const result = paginate(testData, 3, 2);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(5);
      expect(result.pagination.hasNext).toBe(false);
    });

    it('should default to page 1 for invalid input', () => {
      const result = paginate(testData, 0, 2);
      expect(result.pagination.page).toBe(1);
    });
  });

  describe('filter()', () => {
    it('should filter by exact match', () => {
      const result = filter(testData, { role: 'admin' });
      expect(result).toHaveLength(2);
      expect(result.every(item => item.role === 'admin')).toBe(true);
    });

    it('should filter by multiple criteria', () => {
      const result = filter(testData, { role: 'editor', status: 'active' });
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Bob');
      expect(result[1].name).toBe('Diana');
    });

    it('should return all items if filter is empty', () => {
      const result = filter(testData, {});
      expect(result).toHaveLength(5);
    });
  });

  describe('search()', () => {
    it('should search case-insensitively', () => {
      const result = search(testData, 'alice', ['name']);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('should search multiple fields', () => {
      const result = search(testData, 'admin', ['name', 'role']);
      expect(result).toHaveLength(2);
      expect(result.every(item => item.role === 'admin')).toBe(true);
    });

    it('should return empty if no matches', () => {
      const result = search(testData, 'xyz', ['name']);
      expect(result).toHaveLength(0);
    });

    it('should return all if query is empty', () => {
      const result = search(testData, '', ['name']);
      expect(result).toHaveLength(5);
    });
  });

  describe('sort()', () => {
    it('should sort ascending by default', () => {
      const result = sort(testData, 'name', 'asc');
      expect(result[0].name).toBe('Alice');
      expect(result[result.length - 1].name).toBe('Eve');
    });

    it('should sort descending when specified', () => {
      const result = sort(testData, 'name', 'desc');
      expect(result[0].name).toBe('Eve');
      expect(result[result.length - 1].name).toBe('Alice');
    });

    it('should sort by numeric field', () => {
      const result = sort(testData, 'id', 'asc');
      expect(result[0].id).toBe(1);
      expect(result[result.length - 1].id).toBe(5);
    });

    it('should return original if sortBy is empty', () => {
      const result = sort(testData, '', 'asc');
      expect(result[0].id).toBe(1);
    });
  });

  describe('applyFilters()', () => {
    it('should apply all filters together', () => {
      const result = applyFilters(testData, {
        filters: { role: 'editor' },
        sortBy: 'name',
        sortOrder: 'asc',
        page: 1,
        pageSize: 2
      });

      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('Bob');
      expect(result.pagination.total).toBe(2); // 2 editors
      expect(result.pagination.totalPages).toBe(1);
    });

    it('should combine filter and search', () => {
      const result = applyFilters(testData, {
        filters: { role: 'editor' },
        query: 'd',
        searchFields: ['name'],
        page: 1,
        pageSize: 10
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Diana');
    });

    it('should handle empty results gracefully', () => {
      const result = applyFilters(testData, {
        filters: { role: 'nonexistent' },
        page: 1,
        pageSize: 10
      });

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });
  });
});
