'use client'

/** 제품 코드 조합 생성 (#28) — 그룹의 Slot 마다 **승인된** Sub Code 값을 골라 코드를 파생한다.
 *  자유텍스트 입력란은 없다. 승인된 값이 없는 Slot 은 사유를 그대로 노출하고 생성을 막는다. */
import { useEffect, useState, useTransition } from 'react'
import { Modal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import { buildProductCode, loadBuilder, type ActState, type BuilderSpec } from './actions'

export function ComposeModal({ groups, disabled, disabledTitle, onDone }: {
  groups: string[]; disabled?: boolean; disabledTitle?: string; onDone: (st: ActState) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState(groups[0] ?? '')
  const [spec, setSpec] = useState<BuilderSpec | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [sel, setSel] = useState<Record<string, string>>({})
  const [codeName, setCodeName] = useState('')
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!open || !group) return
    setSpec(null); setErr(null); setSel({})
    start(async () => {
      const r = await loadBuilder(group)
      if (r.error) { setErr(r.error); return }
      setSpec(r.spec!)
      // 각 Slot 의 첫 승인값을 기본 선택 — 미리보기가 바로 보이게
      setSel(Object.fromEntries((r.spec!.slots).filter((s) => s.values.length).map((s) => [s.slot, s.values[0].valueCode])))
    })
  }, [open, group])

  const slots = spec?.slots ?? []
  const complete = slots.length > 0 && slots.every((s) => sel[s.slot])
  const preview = complete
    ? `${group} ${slots.map((s) => sel[s.slot]).join('-')}`
    : t('master.composePreviewEmpty', '모든 Slot 선택 시 코드가 파생됩니다')

  const submit = () => start(async () => {
    const st = await buildProductCode(group, codeName, sel)
    onDone(st)
    if (st.ok) { setOpen(false); setCodeName('') }
    else setErr(st.error ?? null)
  })

  return (
    <>
      <button className="b run" type="button" data-pc-compose disabled={disabled}
        title={disabled ? disabledTitle : undefined} onClick={() => setOpen(true)}
        style={{ alignSelf: 'flex-start', width: 'fit-content' }}>
        {t('master.composeBtn', '＋ 조합 생성')}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} width={520}
        title={t('master.composeTitle', '제품 코드 조합 생성 — 승인된 Sub Code 만')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label style={{ width: 64 }}>{t('subcode.group', '그룹')}</label>
            <select className="in" data-pc-compose-group value={group} onChange={(e) => setGroup(e.target.value)} style={{ width: 140 }}>
              {groups.map((g) => <option key={g}>{g}</option>)}
            </select>
            {spec ? <span style={{ color: 'var(--txt-dim)' }}>{spec.groupName} · Slot {slots.length}</span> : null}
          </div>

          {pending && !spec ? <div style={{ color: 'var(--txt-dim)' }}>{t('common.loading', '불러오는 중…')}</div> : null}

          {slots.map((s) => (
            <div key={s.slot} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <label style={{ width: 64 }}><b>{s.slot}</b> </label>
              <span style={{ width: 96, color: 'var(--txt-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.label}>{s.label}</span>
              {s.blocked ? (
                <span style={{ color: 'var(--err)' }} data-pc-slot-blocked={s.slot}>
                  {t('master.slotBlocked', '승인된 값 없음 — S-1-1 에서 승인 후 조합 가능')}
                  {s.pending ? ` (${t('master.slotPending', '대기')} ${s.pending})` : ''}
                </span>
              ) : (
                <>
                  <select className="in" data-pc-slot={s.slot} value={sel[s.slot] ?? ''}
                    onChange={(e) => setSel({ ...sel, [s.slot]: e.target.value })} style={{ width: 180 }}>
                    {s.values.map((v) => (
                      <option key={v.valueId} value={v.valueCode}>
                        {v.valueCode}{v.valueName ? ` — ${v.valueName}` : ''} (Rev {v.revisionNo})
                      </option>
                    ))}
                  </select>
                  {s.pending ? <span style={{ color: 'var(--warn)' }}>{t('master.slotPendingHint', '미승인')} {s.pending}</span> : null}
                </>
              )}
            </div>
          ))}

          {spec && !slots.length ? (
            <div style={{ color: 'var(--err)' }}>{t('master.noSlots', '이 그룹에는 Sub Code Slot 이 없습니다 — 수동 등록을 사용하십시오')}</div>
          ) : null}

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label style={{ width: 64 }}>{t('master.name', '코드명')}</label>
            <input className="in" value={codeName} onChange={(e) => setCodeName(e.target.value)}
              placeholder={t('master.composeNamePh', '비우면 파생 코드와 동일')} style={{ width: 260 }} />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0', borderTop: '1px solid var(--line)' }}>
            <label style={{ width: 64 }}>{t('master.preview', '미리보기')}</label>
            <b data-pc-compose-preview className="mono" style={{ color: complete ? 'var(--title-navy)' : 'var(--txt-dim)' }}>{preview}</b>
          </div>
          {err ? <div style={{ color: 'var(--err)' }} data-pc-compose-err>{err}</div> : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button className="b" type="button" onClick={() => setOpen(false)}>{t('common.cancel', '취소')}</button>
            <button className="b run" type="button" data-pc-compose-ok disabled={pending || !complete}
              title={complete ? undefined : t('master.composeIncomplete', '모든 Slot 을 선택해야 생성할 수 있습니다')}
              onClick={submit}>{t('common.create', '생성')}</button>
          </div>
        </div>
      </Modal>
    </>
  )
}
