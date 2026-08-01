import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronRight,
  Cloud,
  Download,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  HardDrive,
  Search,
  Trash2,
} from 'lucide-react';
import {
  fetchBucketList,
  fetchBucketStats,
  deleteBucketObject,
  type BucketItem,
  type BucketStats,
} from '../api/bucket';
import { useViewMode } from '../contexts/ViewModeContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FILE_ICONS: Record<string, typeof File> = {
  jpg: FileImage, jpeg: FileImage, png: FileImage, gif: FileImage, webp: FileImage, svg: FileImage, bmp: FileImage,
  pdf: FileText, doc: FileText, docx: FileText, txt: FileText, md: FileText, rtf: FileText,
  xls: FileSpreadsheet, xlsx: FileSpreadsheet, csv: FileSpreadsheet,
  mp4: FileVideo, webm: FileVideo, avi: FileVideo, mov: FileVideo, mkv: FileVideo,
  mp3: FileAudio, wav: FileAudio, ogg: FileAudio, flac: FileAudio,
  zip: FileArchive, rar: FileArchive, tar: FileArchive, gz: FileArchive, '7z': FileArchive,
};

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return FILE_ICONS[ext] || File;
}

function formatDate(ts: number | null | undefined) {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Stats Panel ──────────────────────────────────────────────────────────────

function StatsPanel({ stats }: { stats: BucketStats }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
      {/* KPI row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 'var(--space-sm)',
      }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Provider</span>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Cloud size={16} style={{ color: 'var(--color-accent)' }} />
            {stats.provider}
          </span>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total de Arquivos</span>
          <span style={{ fontSize: '1.5rem', fontWeight: 800 }}>{stats.total_files}</span>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tamanho Total</span>
          <span style={{ fontSize: '1.5rem', fontWeight: 800 }}>{stats.total_size_display}</span>
        </div>
      </div>

      {stats.note && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)',
          background: 'rgba(122,191,0,0.06)', border: '1px solid rgba(122,191,0,0.18)',
          fontSize: '0.82rem', color: 'var(--color-text-secondary)',
        }}>
          ℹ️ {stats.note}
        </div>
      )}

      {/* Top folders */}
      {stats.top_folders && stats.top_folders.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{
            padding: '0.85rem 1rem', borderBottom: '1px solid var(--color-border)',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <HardDrive size={16} style={{ color: 'var(--color-accent)' }} />
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Uso por Pasta</span>
          </div>
          {stats.top_folders.map((f) => (
            <div key={f.name} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.6rem 1rem', borderBottom: '1px solid var(--color-border)',
              fontSize: '0.85rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Folder size={14} style={{ color: 'var(--color-text-muted)' }} />
                <span style={{ fontWeight: 600 }}>{f.name}/</span>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                  {f.files} arquivo{f.files !== 1 ? 's' : ''}
                </span>
              </div>
              <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                {f.size_display}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Type breakdown */}
      {stats.type_breakdown && Object.keys(stats.type_breakdown).length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{
            padding: '0.85rem 1rem', borderBottom: '1px solid var(--color-border)',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <File size={16} style={{ color: 'var(--color-accent)' }} />
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Tipos de Arquivo</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', padding: '0.85rem 1rem' }}>
            {Object.entries(stats.type_breakdown).map(([ext, count]) => (
              <span key={ext} style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                padding: '3px 10px', borderRadius: '999px',
                background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
                fontSize: '0.75rem', fontWeight: 600,
              }}>
                .{ext}
                <span style={{
                  background: 'var(--color-accent)', color: '#000',
                  borderRadius: '999px', padding: '0 5px',
                  fontSize: '0.68rem', fontWeight: 800, lineHeight: '1.4',
                }}>
                  {count}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── File Explorer ────────────────────────────────────────────────────────────

function FileExplorer() {
  const { isMobile } = useViewMode();
  const queryClient = useQueryClient();
  const [prefix, setPrefix] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; item: BucketItem | null }>({
    isOpen: false, item: null,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['bucket-list', prefix],
    queryFn: () => fetchBucketList(prefix),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBucketObject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bucket-list', prefix] });
      queryClient.invalidateQueries({ queryKey: ['bucket-stats'] });
      setConfirmDelete({ isOpen: false, item: null });
    },
  });

  const allItems = [...(data?.folders || []), ...(data?.files || [])];
  const filteredItems = searchTerm
    ? allItems.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : allItems;

  return (
    <>
      <div className="card" style={{ padding: 0 }}>
        {/* Header with provider + breadcrumbs */}
        <div style={{
          padding: '0.85rem 1rem',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', flexDirection: 'column', gap: '0.5rem',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            flexWrap: 'wrap', fontSize: '0.82rem',
          }}>
            {data?.breadcrumbs.map((bc, i) => (
              <span key={bc.prefix} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                {i > 0 && <ChevronRight size={12} style={{ color: 'var(--color-text-muted)' }} />}
                <button
                  onClick={() => setPrefix(bc.prefix)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                    fontWeight: i === (data?.breadcrumbs.length || 0) - 1 ? 700 : 500,
                    color: i === (data?.breadcrumbs.length || 0) - 1 ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    fontSize: '0.82rem',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {bc.name}
                </button>
              </span>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{
              position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)',
              color: 'var(--color-text-muted)', pointerEvents: 'none',
            }} />
            <input
              className="input"
              placeholder="Filtrar neste diretório..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '2rem', fontSize: '0.82rem' }}
            />
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div style={{ padding: 'var(--space-xl)', display: 'flex', justifyContent: 'center' }}>
            <span className="spinner" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
            <FolderOpen className="empty-state-icon" />
            <h3 className="empty-state-title">
              {searchTerm ? 'Nenhum resultado' : 'Pasta vazia'}
            </h3>
            <p className="empty-state-text">
              {searchTerm
                ? `Nenhum item corresponde a "${searchTerm}".`
                : 'Este diretório não contém arquivos ou subpastas.'
              }
            </p>
          </div>
        ) : (
          <div>
            {filteredItems.map(item => {
              const isFolder = item.type === 'folder';
              const IconComponent = isFolder ? Folder : getFileIcon(item.name);
              return (
                <div
                  key={item.key}
                  style={{
                    display: 'flex',
                    alignItems: isMobile ? 'flex-start' : 'center',
                    flexDirection: isMobile ? 'column' : 'row',
                    gap: isMobile ? '0.5rem' : '0.75rem',
                    padding: '0.65rem 1rem',
                    borderBottom: '1px solid var(--color-border)',
                    cursor: isFolder ? 'pointer' : 'default',
                    transition: 'background 0.1s',
                  }}
                  onClick={isFolder ? () => setPrefix(item.key) : undefined}
                  onMouseEnter={e => { if (isFolder) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                  onMouseLeave={e => { if (isFolder) e.currentTarget.style.background = ''; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                    <IconComponent
                      size={18}
                      style={{
                        color: isFolder ? 'var(--color-accent)' : 'var(--color-text-muted)',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{
                      fontWeight: isFolder ? 600 : 400,
                      fontSize: '0.85rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {item.name}
                    </span>
                    {isFolder && item.children_count != null && (
                      <span style={{
                        fontSize: '0.7rem', color: 'var(--color-text-muted)',
                        background: 'var(--color-bg-hover)', padding: '1px 6px',
                        borderRadius: '999px', flexShrink: 0,
                      }}>
                        {item.children_count} arquivo{item.children_count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    fontSize: '0.78rem', color: 'var(--color-text-muted)',
                    flexShrink: 0,
                    width: isMobile ? '100%' : 'auto',
                    justifyContent: isMobile ? 'space-between' : 'flex-end',
                  }}>
                    <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: '70px', textAlign: 'right' }}>
                      {item.size_display}
                    </span>
                    {!isFolder && item.modified && (
                      <span style={{ minWidth: '120px', textAlign: 'right' }}>
                        {formatDate(item.modified)}
                      </span>
                    )}
                    {!isFolder && (
                      <div style={{ display: 'flex', gap: '0.25rem' }} onClick={e => e.stopPropagation()}>
                        <a
                          href={`/media/${item.key}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm"
                          style={{ padding: '3px 6px', fontSize: '0.72rem' }}
                          title="Abrir/Download"
                        >
                          <Download size={12} />
                        </a>
                        <button
                          className="btn btn-sm"
                          style={{
                            padding: '3px 6px', fontSize: '0.72rem',
                            color: '#ff6b6b', borderColor: 'rgba(255,107,107,0.3)',
                          }}
                          title="Excluir arquivo"
                          onClick={() => setConfirmDelete({ isOpen: true, item })}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                    {isFolder && <ChevronRight size={14} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        {data && (
          <div style={{
            padding: '0.6rem 1rem',
            fontSize: '0.75rem',
            color: 'var(--color-text-muted)',
            borderTop: '1px solid var(--color-border)',
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>{data.folders.length} pasta{data.folders.length !== 1 ? 's' : ''} · {data.files.length} arquivo{data.files.length !== 1 ? 's' : ''}</span>
            <span style={{ opacity: 0.7 }}>{data.provider}</span>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete.isOpen && confirmDelete.item && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: '1rem', animation: 'fadeIn 0.2s ease',
        }}>
          <div className="card" style={{
            maxWidth: 440, width: '100%', padding: '1.75rem',
            animation: 'slideUp 0.2s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'rgba(255,107,107,0.12)', border: '1px solid rgba(255,107,107,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <AlertTriangle size={18} style={{ color: '#ff6b6b' }} />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ff6b6b' }}>
                Excluir arquivo
              </h3>
            </div>
            <p style={{
              color: 'var(--color-text-secondary)', fontSize: '0.88rem',
              lineHeight: 1.6, marginBottom: '0.75rem',
            }}>
              Tem certeza que deseja excluir permanentemente este arquivo do bucket?
            </p>
            <div style={{
              background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)',
              padding: '0.6rem 0.85rem', marginBottom: '1.5rem',
              fontSize: '0.8rem', color: 'var(--color-text-muted)',
              wordBreak: 'break-all', fontFamily: 'monospace',
            }}>
              {confirmDelete.item.key}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                className="btn"
                onClick={() => setConfirmDelete({ isOpen: false, item: null })}
                disabled={deleteMutation.isPending}
              >
                Cancelar
              </button>
              <button
                className="btn"
                style={{ background: '#ff6b6b', color: '#fff', border: 'none' }}
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (confirmDelete.item) deleteMutation.mutate(confirmDelete.item.key);
                }}
              >
                {deleteMutation.isPending ? 'Excluindo...' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── Main BucketTab Component ─────────────────────────────────────────────────

export function BucketTab() {
  const [view, setView] = useState<'explorer' | 'stats'>('explorer');

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['bucket-stats'],
    queryFn: fetchBucketStats,
  });

  return (
    <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      {/* Sub-tabs */}
      <div style={{
        display: 'flex', gap: '0.5rem', flexWrap: 'wrap',
        borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem',
      }}>
        <button
          className={`btn ${view === 'explorer' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setView('explorer')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <FolderOpen size={14} />
          Explorar
        </button>
        <button
          className={`btn ${view === 'stats' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setView('stats')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <HardDrive size={14} />
          Estatísticas
        </button>
      </div>

      {view === 'explorer' && <FileExplorer />}
      {view === 'stats' && (
        statsLoading ? (
          <div style={{ padding: 'var(--space-xl)', display: 'flex', justifyContent: 'center' }}>
            <span className="spinner" />
          </div>
        ) : stats ? (
          <StatsPanel stats={stats} />
        ) : null
      )}
    </div>
  );
}
