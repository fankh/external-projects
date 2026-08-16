/**
 * Guardrail Audit Trail - Per-prompt immutable audit records
 *
 * Every guardrail decision (allowed / masked / blocked) is recorded as an
 * AuditLog row whose details carry a SHA-256 hash chain: each entry hashes
 * its payload together with the previous entry hash, so any tampering with
 * stored records breaks the chain. Optionally forwards each record to a
 * SIEM via UDP syslog (RFC 5424) when SYSLOG_HOST is set.
 */

const crypto = require('crypto');
const dgram = require('dgram');
const os = require('os');
const { AuditLog } = require('../../models');

const EVENT_TYPE = 'GUARDRAIL';

/** In-process chain tails per tenant, seeded from the last stored entry */
const chainTails = new Map();

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function getPrevHash(tenantId) {
  if (chainTails.has(tenantId)) return chainTails.get(tenantId);
  const last = await AuditLog.findOne({
    where: { eventType: EVENT_TYPE, tenantId },
    order: [['createdAt', 'DESC']]
  });
  const prev = last?.details?.entryHash || 'GENESIS';
  chainTails.set(tenantId, prev);
  return prev;
}

function sendSyslog(record) {
  const host = process.env.SYSLOG_HOST;
  if (!host) return;
  const port = parseInt(process.env.SYSLOG_PORT || '514', 10);
  // facility local0 (16), severity informational (6) -> PRI 134
  const msg = `<134>1 ${new Date().toISOString()} ${os.hostname()} kyra-guardrail - - - ${JSON.stringify(record)}`;
  const socket = dgram.createSocket('udp4');
  socket.send(Buffer.from(msg), port, host, () => socket.close());
}

class GuardrailAuditTrail {
  /**
   * Record one guardrail decision and extend the hash chain.
   *
   * @param {object} entry
   * @param {string} entry.tenantId
   * @param {string} entry.userEmail
   * @param {string} entry.verdict allowed | masked | blocked
   * @param {string} entry.stage injection | dlp_prompt | dlp_response | gateway
   * @param {string} entry.prompt original prompt text (stored as hash only)
   * @param {string} [entry.response] final response text (stored as hash only)
   * @param {object} [entry.detail] verdict specifics (rule ids, categories, provider, latencies)
   * @returns {Promise<{entryHash: string, seq: number}>}
   */
  static async record({ tenantId, userEmail, verdict, stage, prompt, response, detail }) {
    const prevHash = await getPrevHash(tenantId);
    const payload = {
      verdict,
      stage,
      promptHash: sha256(prompt || ''),
      responseHash: response ? sha256(response) : null,
      detail: detail || {},
      at: new Date().toISOString()
    };
    const entryHash = sha256(prevHash + JSON.stringify(payload));
    chainTails.set(tenantId, entryHash);

    await AuditLog.create({
      eventType: EVENT_TYPE,
      user: userEmail,
      resource: 'chat',
      action: `guardrail:${verdict}`,
      status: verdict === 'blocked' ? 'failure' : 'success',
      ipAddress: detail?.ipAddress || null,
      details: { ...payload, prevHash, entryHash },
      tenantId
    });

    sendSyslog({ tenantId, user: userEmail, ...payload, prevHash, entryHash });

    return { entryHash };
  }

  /**
   * Verify hash chain integrity for a tenant.
   * @returns {Promise<{valid: boolean, checked: number, brokenAt: string|null}>}
   */
  static async verifyChain(tenantId) {
    const rows = await AuditLog.findAll({
      where: { eventType: EVENT_TYPE, tenantId },
      order: [['createdAt', 'ASC']]
    });
    let prev = 'GENESIS';
    for (const row of rows) {
      const d = row.details || {};
      const payload = {
        verdict: d.verdict, stage: d.stage, promptHash: d.promptHash,
        responseHash: d.responseHash, detail: d.detail, at: d.at
      };
      const expected = sha256(prev + JSON.stringify(payload));
      if (d.prevHash !== prev || d.entryHash !== expected) {
        return { valid: false, checked: rows.length, brokenAt: row.id };
      }
      prev = d.entryHash;
    }
    return { valid: true, checked: rows.length, brokenAt: null };
  }

  /** Reset in-process chain cache (used by tests) */
  static resetCache() {
    chainTails.clear();
  }
}

module.exports = GuardrailAuditTrail;
