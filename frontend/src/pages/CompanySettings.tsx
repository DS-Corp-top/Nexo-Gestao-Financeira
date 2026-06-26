import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, KeyRound, MapPin, Save } from 'lucide-react';
import { createNfseCredential, fetchNfseCredentials, fetchTenantProfile, lookupCep, updateNfseCredential, updateTenantProfile } from '../api/tenant';
import { useAuth } from '../contexts/AuthContext';
import { useViewMode } from '../contexts/ViewModeContext';

export default function CompanySettings() {
  const { isMobile } = useViewMode();
  const cols2 = isMobile ? '1fr' : '1fr 1fr';
  const cols21 = isMobile ? '1fr' : '2fr 1fr';
  const cols211 = isMobile ? '1fr' : '2fr 1fr 1fr';
  const { tenant } = useAuth();
  const queryClient = useQueryClient();
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [cepLoading, setCepLoading] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['tenantProfile'],
    queryFn: fetchTenantProfile,
  });

  const { data: nfseCredentials } = useQuery({
    queryKey: ['nfseCredentials'],
    queryFn: fetchNfseCredentials,
  });
  const nfseCredential = nfseCredentials?.[0];

  const updateMutation = useMutation({
    mutationFn: updateTenantProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenantProfile'] });
      setSuccessMsg('Dados da empresa atualizados com sucesso!');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: () => {
      setErrorMsg('Erro ao atualizar os dados. Verifique e tente novamente.');
    }
  });

  const nfseMutation = useMutation({
    mutationFn: (payload: { gov_br_cpf: string; gov_br_password?: string }) => (
      nfseCredential
        ? updateNfseCredential(nfseCredential.id, payload)
        : createNfseCredential(payload)
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nfseCredentials'] });
      setSuccessMsg('Credenciais NFS-e salvas com sucesso!');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: () => setErrorMsg('Erro ao salvar credenciais NFS-e.'),
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSuccessMsg('');
    setErrorMsg('');
    
    const formData = new FormData(e.currentTarget);
    const file = formData.get('logo') as File;
    if (file && file.size === 0) {
      formData.delete('logo');
    }

    await updateMutation.mutateAsync(formData);
  };

  const handleCepLookup = async () => {
    const input = document.querySelector<HTMLInputElement>('input[name="postal_code"]');
    const cep = input?.value || '';
    if (!cep.trim()) return;
    setCepLoading(true);
    setErrorMsg('');
    try {
      const data = await lookupCep(cep);
      document.querySelector<HTMLInputElement>('input[name="address"]')!.value = data.address || '';
      document.querySelector<HTMLInputElement>('input[name="district"]')!.value = data.district || '';
      document.querySelector<HTMLInputElement>('input[name="city"]')!.value = data.city || '';
      document.querySelector<HTMLInputElement>('input[name="state"]')!.value = data.state || '';
      if (input) input.value = data.postal_code || cep;
    } catch {
      setErrorMsg('CEP não encontrado ou serviço indisponível.');
    } finally {
      setCepLoading(false);
    }
  };

  const handleNfseSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const gov_br_cpf = String(formData.get('gov_br_cpf') || '');
    const gov_br_password = String(formData.get('gov_br_password') || '');
    await nfseMutation.mutateAsync({
      gov_br_cpf,
      ...(gov_br_password ? { gov_br_password } : {}),
    });
    e.currentTarget.reset();
  };

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <div className="page-header">
          <h2 className="page-title">Configurações da Empresa</h2>
        </div>
        <div className="card skeleton" style={{ height: 400 }} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">Configurações da Empresa</h2>
      </div>

      <div className="card" style={{ maxWidth: 800 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--color-bg-elevated)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--color-border)',
            overflow: 'hidden'
          }}>
            {profile?.logo ? (
              <img src={profile.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <Building2 size={32} style={{ color: 'var(--color-text-muted)' }} />
            )}
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{profile?.name}</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
              ID: {tenant?.slug}
            </p>
          </div>
        </div>

        {successMsg && (
          <div style={{ background: 'var(--color-success-muted)', color: 'var(--color-success)', padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', fontSize: '0.875rem' }}>
            {successMsg}
          </div>
        )}
        
        {errorMsg && (
          <div style={{ background: 'var(--color-danger-muted)', color: 'var(--color-danger)', padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', fontSize: '0.875rem' }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">Nome da Empresa</label>
              <input type="text" name="name" className="input" defaultValue={profile?.name} required />
            </div>
            <div>
              <label className="label">CNPJ / CPF</label>
              <input type="text" name="document" className="input" defaultValue={profile?.document} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">E-mail de Contato</label>
              <input type="email" name="email" className="input" defaultValue={profile?.email} />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input type="text" name="phone" className="input" defaultValue={profile?.phone} />
            </div>
          </div>

          <h4 style={{ fontSize: '1rem', fontWeight: 600, marginTop: 'var(--space-xl)', marginBottom: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>
            Endereço (para Notas Fiscais)
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: cols21, gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">Logradouro</label>
              <input type="text" name="address" className="input" defaultValue={profile?.address} />
            </div>
            <div>
              <label className="label">Número</label>
              <input type="text" name="address_number" className="input" defaultValue={profile?.address_number} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">Complemento</label>
              <input type="text" name="address_complement" className="input" defaultValue={profile?.address_complement} />
            </div>
            <div>
              <label className="label">Bairro</label>
              <input type="text" name="district" className="input" defaultValue={profile?.district} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: cols211, gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
            <div>
              <label className="label">Cidade</label>
              <input type="text" name="city" className="input" defaultValue={profile?.city} />
            </div>
            <div>
              <label className="label">Estado (UF)</label>
              <input type="text" name="state" className="input" defaultValue={profile?.state} maxLength={2} />
            </div>
            <div>
              <label className="label">CEP</label>
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <input type="text" name="postal_code" className="input" defaultValue={profile?.postal_code} />
                <button type="button" className="btn btn-secondary" onClick={handleCepLookup} disabled={cepLoading}>
                  <MapPin size={16} />
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-xl)' }}>
            <label className="label">Logo da Empresa</label>
            <input type="file" name="logo" className="input" accept="image/*" />
            <span className="field-error" style={{ color: 'var(--color-text-muted)' }}>Utilizado na impressão de faturas.</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={updateMutation.isPending}
            >
              <Save size={18} />
              {updateMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ maxWidth: 800, marginTop: 'var(--space-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
          <KeyRound size={22} style={{ color: 'var(--color-accent)' }} />
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Credenciais NFS-e</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
              {nfseCredential?.has_password ? 'Senha configurada' : 'Senha ainda não configurada'}
            </p>
          </div>
        </div>

        <form onSubmit={handleNfseSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">CPF do portal NFS-e</label>
              <input type="text" name="gov_br_cpf" className="input" defaultValue={nfseCredential?.gov_br_cpf} required />
            </div>
            <div>
              <label className="label">Senha</label>
              <input type="password" name="gov_br_password" className="input" placeholder={nfseCredential?.has_password ? 'Deixe em branco para manter' : ''} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={nfseMutation.isPending}>
              <Save size={18} />
              {nfseMutation.isPending ? 'Salvando...' : 'Salvar Credenciais'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
