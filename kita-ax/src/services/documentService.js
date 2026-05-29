/**
 * Document Service - Database operations for Document model
 */

const { Document } = require('../models');
const { Op } = require('sequelize');

class DocumentService {
  /**
   * Get all documents with pagination, filtering, and search
   */
  static async getAllDocuments({ page = 1, pageSize = 10, search, classification, sortBy = 'createdAt', sortOrder = 'desc', tenantId }) {
    const limit = Math.min(parseInt(pageSize), 100);
    const offset = (Math.max(1, parseInt(page)) - 1) * limit;

    const where = { tenantId };

    if (classification) where.classification = classification;

    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { owner: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const order = [[sortBy || 'createdAt', sortOrder === 'asc' ? 'ASC' : 'DESC']];

    const { count, rows } = await Document.findAndCountAll({
      where,
      limit,
      offset,
      order
    });

    return {
      data: rows,
      pagination: {
        page: Math.max(1, parseInt(page)),
        pageSize: limit,
        total: count,
        totalPages: Math.ceil(count / limit),
        hasNext: offset + limit < count,
        hasPrev: offset > 0
      }
    };
  }

  /**
   * Get document by ID
   */
  static async getDocumentById(id, tenantId) {
    const document = await Document.findOne({
      where: { id, tenantId }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    return document;
  }

  /**
   * Create new document
   */
  static async createDocument({ title, classification, owner, description, tenantId }) {
    const document = await Document.create({
      title,
      classification,
      owner,
      description,
      tenantId,
      accessCount: 0,
      size: 0
    });

    return document;
  }

  /**
   * Update document
   */
  static async updateDocument(id, { title, classification, owner, description }, tenantId) {
    const document = await Document.findOne({ where: { id, tenantId } });
    if (!document) {
      throw new Error('Document not found');
    }

    if (title) document.title = title;
    if (classification) document.classification = classification;
    if (owner) document.owner = owner;
    if (description !== undefined) document.description = description;

    await document.save();

    return document;
  }

  /**
   * Delete document
   */
  static async deleteDocument(id, tenantId) {
    const document = await Document.findOne({ where: { id, tenantId } });
    if (!document) {
      throw new Error('Document not found');
    }

    await document.destroy();
    return { success: true, message: 'Document deleted successfully' };
  }

  /**
   * Increment access count
   */
  static async incrementAccessCount(id, tenantId) {
    const document = await Document.findOne({ where: { id, tenantId } });
    if (document) {
      document.accessCount = (document.accessCount || 0) + 1;
      await document.save();
    }
  }

  /**
   * Get documents by classification
   */
  static async getByClassification(classification, tenantId) {
    return Document.findAll({
      where: { classification, tenantId },
      attributes: ['id', 'title', 'classification']
    });
  }

  /**
   * Get documents by owner
   */
  static async getByOwner(owner, tenantId) {
    return Document.findAll({
      where: { owner, tenantId },
      order: [['createdAt', 'DESC']]
    });
  }

  /**
   * Count documents by classification
   */
  static async countByClassification(tenantId) {
    const counts = await Document.findAll({
      where: { tenantId },
      attributes: [
        'classification',
        [Document.sequelize.fn('COUNT', Document.sequelize.col('id')), 'count']
      ],
      group: ['classification'],
      raw: true
    });

    return counts;
  }

  /**
   * Update document with file metadata
   */
  static async updateFileMetadata(id, { filePath, fileName, fileMimeType, fileSize }, tenantId) {
    const document = await Document.findOne({ where: { id, tenantId } });
    if (!document) {
      throw new Error('Document not found');
    }

    document.filePath = filePath;
    document.fileName = fileName;
    document.fileMimeType = fileMimeType;
    document.fileSize = fileSize;
    document.uploadedAt = new Date();

    await document.save();
    return document;
  }

  /**
   * Get file metadata for a document
   */
  static async getFileMetadata(id, tenantId) {
    const document = await Document.findOne({
      where: { id, tenantId },
      attributes: ['id', 'filePath', 'fileName', 'fileMimeType', 'fileSize', 'uploadedAt']
    });

    if (!document) {
      throw new Error('Document not found');
    }

    return document;
  }

  /**
   * Clear file metadata (when file is deleted)
   */
  static async clearFileMetadata(id, tenantId) {
    const document = await Document.findOne({ where: { id, tenantId } });
    if (!document) {
      throw new Error('Document not found');
    }

    document.filePath = null;
    document.fileName = null;
    document.fileMimeType = null;
    document.fileSize = null;
    document.uploadedAt = null;

    await document.save();
    return document;
  }
}

module.exports = DocumentService;
