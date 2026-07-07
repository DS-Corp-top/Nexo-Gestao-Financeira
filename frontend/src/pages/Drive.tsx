import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchDocuments, uploadDocument, deleteDocument, fetchFolders, createFolder, deleteFolder, type Document, type Folder } from '../api/drive';
import { fetchTenantCompanies } from '../api/tenant';
import { CloudUpload, File, Trash2, Download, Search, Filter, Folder as FolderIcon, Plus, ChevronRight } from 'lucide-react';

export default function Drive() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [search, setSearch] = useState('');
  
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderCompany, setNewFolderCompany] = useState('');
  
  const { data: companies } = useQuery({
    queryKey: ['tenantCompanies'],
    queryFn: fetchTenantCompanies,
  });

  const { data: foldersData, isLoading: loadingFolders } = useQuery({
    queryKey: ['drive-folders', selectedCompany],
    queryFn: () => fetchFolders({ company: selectedCompany || undefined }),
    enabled: !currentFolder && !search // Only show folders at root and when not searching
  });

  const { data: documentsData, isLoading: loadingDocs } = useQuery({
    queryKey: ['drive-documents', selectedCompany, search, currentFolder?.id],
    queryFn: () => fetchDocuments({ 
      company: selectedCompany || undefined, 
      search,
      folder: currentFolder ? currentFolder.id.toString() : undefined
    }),
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file, companyId, folderId }: { file: File, companyId?: string, folderId?: string }) => uploadDocument(file, companyId, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-documents'] });
    },
    onError: (err: any) => {
      alert('Erro ao fazer upload: ' + (err.response?.data?.detail || err.message));
    }
  });

  const deleteDocMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-documents'] });
    },
  });
  
  const createFolderMutation = useMutation({
    mutationFn: createFolder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-folders'] });
      setIsFolderModalOpen(false);
      setNewFolderName('');
      setNewFolderCompany('');
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: deleteFolder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-folders'] });
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      // If we are inside a folder, inherit its company. Otherwise, use the selected filter.
      const companyId = currentFolder ? (currentFolder.company?.toString() || '') : selectedCompany;
      const folderId = currentFolder ? currentFolder.id.toString() : undefined;
      
      await uploadMutation.mutateAsync({ file, companyId, folderId });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    await createFolderMutation.mutateAsync({ 
      name: newFolderName.trim(), 
      company: newFolderCompany || undefined 
    });
  };

  const handleDeleteDoc = async (doc: Document) => {
    if (confirm(`Tem certeza que deseja apagar o documento "${doc.title}"?`)) {
      await deleteDocMutation.mutateAsync(doc.id);
    }
  };
  
  const handleDeleteFolder = async (e: React.MouseEvent, folder: Folder) => {
    e.stopPropagation(); // prevent navigation
    if (confirm(`Tem certeza que deseja apagar a pasta "${folder.name}" e TUDO que tem dentro dela?`)) {
      await deleteFolderMutation.mutateAsync(folder.id);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const docs = documentsData?.results || [];
  const folders = foldersData?.results || [];
  
  const isLoading = loadingDocs || (loadingFolders && !currentFolder && !search);

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CloudUpload size={24} />
            Drive
          </h2>
          {currentFolder && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              <button 
                className="btn-ghost" 
                style={{ padding: '2px 6px', fontSize: '0.85rem' }} 
                onClick={() => setCurrentFolder(null)}
              >
                Início
              </button>
              <ChevronRight size={14} />
              <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                {currentFolder.name}
              </span>
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', alignItems: 'center', flex: '1 1 auto', justifyContent: 'flex-start' }}>
          {!currentFolder && (
            <div style={{ position: 'relative', flex: '1 1 140px', minWidth: 140 }}>
              <Filter size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
              <select 
                className="input" 
                value={selectedCompany} 
                onChange={(e) => setSelectedCompany(e.target.value)}
                style={{ width: '100%', appearance: 'none', paddingLeft: 32, height: 40 }}
              >
                <option value="">Geral / Todas</option>
                {companies?.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ position: 'relative', flex: '1 1 140px', minWidth: 140 }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            <input 
              type="text" 
              className="input" 
              placeholder="Buscar arquivo..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', paddingLeft: 32, height: 40 }}
            />
          </div>
          
          {!currentFolder && (
            <button 
              className="btn btn-ghost btn-icon drive-folder-trigger" 
              onClick={() => setIsFolderModalOpen(true)}
              aria-label="Nova pasta"
              title="Nova pasta"
            >
              <Plus size={20} />
            </button>
          )}
          
          <button 
            className="btn btn-primary btn-icon drive-upload-trigger" 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            aria-label="Novo arquivo"
            title="Novo arquivo"
          >
            <CloudUpload size={20} style={{ opacity: uploadMutation.isPending ? 0.55 : 1 }} />
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleFileChange}
          />
        </div>
      </div>

      {isLoading ? (
         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 'var(--space-md)' }}>
           {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 120 }} />)}
         </div>
      ) : (folders.length === 0 && docs.length === 0) ? (
        <div className="empty-state">
          <CloudUpload className="empty-state-icon" />
          <h3 className="empty-state-title">Nenhum item encontrado</h3>
          <p className="empty-state-text">
            {search ? 'Tente ajustar os filtros de busca.' : 'Comece criando uma pasta ou fazendo upload de um arquivo.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-md)' }}>
          {/* Folders (only show if not searching and not inside a folder) */}
          {!currentFolder && !search && folders.map(folder => (
            <div 
              key={`folder-${folder.id}`} 
              className="card" 
              style={{ display: 'flex', flexDirection: 'column', padding: 'var(--space-md)', cursor: 'pointer', border: '1px solid var(--color-border)', transition: 'border-color 0.2s' }}
              onClick={() => setCurrentFolder(folder)}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-accent)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-sm)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(52, 211, 153, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FolderIcon size={20} color="var(--color-accent)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={folder.name}>
                    {folder.name}
                  </h4>
                  <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Pasta
                  </p>
                </div>
              </div>
              
              <div style={{ marginTop: 'auto', paddingTop: 'var(--space-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>
                  {folder.company_name || 'Geral'}
                </span>
                
                <button 
                  className="btn-ghost btn-icon" 
                  onClick={(e) => handleDeleteFolder(e, folder)} 
                  title="Excluir Pasta"
                  style={{ color: 'var(--color-danger)' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}

          {/* Documents */}
          {docs.map(doc => (
            <div key={`doc-${doc.id}`} className="card" style={{ display: 'flex', flexDirection: 'column', padding: 'var(--space-md)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-sm)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <File size={20} color="var(--color-text-secondary)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.title}>
                    {doc.title}
                  </h4>
                  <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {formatSize(doc.file_size)} • {doc.file_type.toUpperCase()}
                  </p>
                </div>
              </div>
              
              <div style={{ marginTop: 'auto', paddingTop: 'var(--space-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>
                  {doc.company_name || 'Geral'}
                </span>
                
                <div style={{ display: 'flex', gap: 4 }}>
                  <a 
                    href={doc.file_url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="btn-ghost btn-icon" 
                    title="Baixar/Visualizar"
                  >
                    <Download size={16} />
                  </a>
                  <button 
                    className="btn-ghost btn-icon" 
                    onClick={() => handleDeleteDoc(doc)} 
                    title="Excluir"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Nova Pasta */}
      {isFolderModalOpen && createPortal(
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>Criar Nova Pasta</h3>
              <button className="btn-ghost btn-icon" onClick={() => setIsFolderModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateFolder}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nome da Pasta</label>
                  <input 
                    type="text" 
                    className="input" 
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Ex: Contratos 2026"
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Vincular a uma Empresa</label>
                  <select 
                    className="input" 
                    value={newFolderCompany}
                    onChange={(e) => setNewFolderCompany(e.target.value)}
                  >
                    <option value="">Geral / Todas as Empresas</option>
                    {companies?.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                    Arquivos enviados para dentro desta pasta herdarão automaticamente esta empresa.
                  </p>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsFolderModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={createFolderMutation.isPending || !newFolderName.trim()}>
                  {createFolderMutation.isPending ? 'Criando...' : 'Criar Pasta'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
