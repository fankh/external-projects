// Pagination and filtering utilities

function paginate(items, page = 1, pageSize = 10) {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const size = Math.max(1, Math.min(100, parseInt(pageSize) || 10));

  const total = items.length;
  const totalPages = Math.ceil(total / size);
  const startIndex = (pageNum - 1) * size;
  const endIndex = Math.min(startIndex + size, total);

  return {
    data: items.slice(startIndex, endIndex),
    pagination: {
      page: pageNum,
      pageSize: size,
      total,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1
    }
  };
}

function filter(items, filters = {}) {
  return items.filter(item => {
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === '') continue;

      const itemValue = item[key];

      if (typeof itemValue === 'string') {
        if (!itemValue.toLowerCase().includes(String(value).toLowerCase())) {
          return false;
        }
      } else if (itemValue !== value) {
        return false;
      }
    }
    return true;
  });
}

function search(items, query, searchFields = []) {
  if (!query || !searchFields.length) return items;

  const lowerQuery = query.toLowerCase();
  return items.filter(item => {
    return searchFields.some(field => {
      const value = item[field];
      if (value === null || value === undefined) return false;
      return String(value).toLowerCase().includes(lowerQuery);
    });
  });
}

function sort(items, sortBy, sortOrder = 'asc') {
  if (!sortBy) return items;

  const sorted = [...items].sort((a, b) => {
    const aValue = a[sortBy];
    const bValue = b[sortBy];

    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;

    if (typeof aValue === 'string') {
      return sortOrder === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  return sorted;
}

function applyFilters(items, options = {}) {
  const {
    filters = {},
    query = '',
    searchFields = [],
    sortBy = '',
    sortOrder = 'asc',
    page = 1,
    pageSize = 10
  } = options;

  let result = items;

  if (Object.keys(filters).length > 0) {
    result = filter(result, filters);
  }

  if (query && searchFields.length > 0) {
    result = search(result, query, searchFields);
  }

  if (sortBy) {
    result = sort(result, sortBy, sortOrder);
  }

  return paginate(result, page, pageSize);
}

module.exports = {
  paginate,
  filter,
  search,
  sort,
  applyFilters
};
