import React, { useState, useEffect } from 'react';
const supabase = require('../data/supabase'); // Ajuste o caminho se necessário

export default function AdminPanel() {
  const [secaoAtiva, setSecaoAtiva] = useState('inicio');
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(false);

  // Campos para criar/editar
  const [novoIdentificador, setNovoIdentificador] = useState('');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [imagemUrl, setImagemUrl] = useState('');

  useEffect(() => {
    carregarConteudo(secaoAtiva);
  }, [secaoAtiva]);

  async function carregarConteudo(secao) {
    if (!supabase.enabled()) return;
    setLoading(true);
    try {
      const rows = await supabase.request(`conteudos_site?secao=eq.${secao}&select=*`);
      setItens(rows || []);
    } catch (err) {
      console.error('Erro ao carregar conteúdos:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSalvar(e) {
    e.preventDefault();
    if (!supabase.enabled()) return;

    try {
      await supabase.request('conteudos_site', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          secao: secaoAtiva,
          identificador: novoIdentificador || `bloco_${Date.now()}`,
          titulo,
          descricao,
          imagem_url: imagemUrl,
        }),
      });
      alert('Guardado com sucesso!');
      setTitulo('');
      setDescricao('');
      setImagemUrl('');
      setNovoIdentificador('');
      carregarConteudo(secaoAtiva);
    } catch (err) {
      console.error('Erro ao salvar:', err);
      alert('Erro ao guardar conteúdo.');
    }
  }

  async function handleApagar(identificador) {
    if (!confirm('Tem a certeza que deseja remover esta caixa de texto/bloco?')) return;
    try {
      await supabase.request(`conteudos_site?identificador=eq.${identificador}`, {
        method: 'DELETE',
      });
      carregarConteudo(secaoAtiva);
    } catch (err) {
      console.error('Erro ao apagar:', err);
    }
  }

  return (
    <div style={{ padding: '20px', color: '#fff', backgroundColor: '#112211', minHeight: '100vh' }}>
      <h2>Painel de Gestão — Administrador</h2>
      
      {/* Seletor de Secções */}
      <div style={{ margin: '20px 0', display: 'flex', gap: '10px' }}>
        {['inicio', 'gastronomia', 'oficinas', 'lendarias'].map((s) => (
          <button
            key={s}
            onClick={() => setSecaoAtiva(s)}
            style={{
              padding: '10px 15px',
              backgroundColor: secaoAtiva === s ? '#d97706' : '#2d3748',
              color: '#fff',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
            }}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Formulário para Adicionar / Editar Bloco */}
      <form onSubmit={handleSalvar} style={{ background: '#1a2e1a', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3>Adicionar / Atualizar Bloco ou Caixa de Texto</h3>
        <div style={{ marginBottom: '10px' }}>
          <label>Identificador Único (ex: 'como_chegar', 'damurida_card'):</label><br />
          <input
            type="text"
            value={novoIdentificador}
            onChange={(e) => setNovoIdentificador(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Título:</label><br />
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Descrição / Texto:</label><br />
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows="4"
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>URL da Foto (Capa ou Interna):</label><br />
          <input
            type="text"
            value={imagemUrl}
            onChange={(e) => setImagemUrl(e.target.value)}
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        <button type="submit" style={{ padding: '10px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
          Guardar / Publicar Alteração
        </button>
      </form>

      {/* Lista de Blocos Existentes na Secção */}
      <h3>Blocos Atuais em {secaoAtiva.toUpperCase()}</h3>
      {loading ? <p>A carregar...</p> : (
        <div>
          {itens.map((item) => (
            <div key={item.id} style={{ border: '1px solid #334155', padding: '15px', borderRadius: '6px', marginBottom: '10px', background: '#0f172a' }}>
              <h4>{item.titulo || item.identificador}</h4>
              <p><strong>Identificador:</strong> {item.identificador}</p>
              <p>{item.descricao}</p>
              {item.imagem_url && <img src={item.imagem_url} alt="foto" style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '4px' }} />}
              <div style={{ marginTop: '10px' }}>
                <button
                  onClick={() => handleApagar(item.identificador)}
                  style={{ padding: '5px 10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Remover Caixa / Bloco
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
