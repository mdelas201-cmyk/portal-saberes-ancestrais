// Login e cadastro do site (modal). Fala com /api/auth.
// Grava a sessão em localStorage (portal_token e portal_user), que o chat lê.
(function () {
  const API = '/api';

  const modal = document.getElementById('modal-login');
  const formLogin = document.getElementById('form-login');
  const formCadastro = document.getElementById('form-cadastro');
  const abaEntrar = document.getElementById('aba-entrar');
  const abaCadastrar = document.getElementById('aba-cadastrar');
  const erroEl = document.getElementById('login-erro');
  const btnLogin = document.getElementById('btn-login');
  const btnLoginMobile = document.getElementById('btn-login-mobile');

  // ---- sessão (localStorage pode falhar em modo privado; o site continua funcionando) ----
  function lerSessao() {
    try {
      const token = localStorage.getItem('portal_token');
      const user = JSON.parse(localStorage.getItem('portal_user') || 'null');
      return token && user ? { token, user } : null;
    } catch (_) {
      return null;
    }
  }

  function gravarSessao(token, user) {
    try {
      localStorage.setItem('portal_token', token);
      localStorage.setItem('portal_user', JSON.stringify(user));
    } catch (_) {}
  }

  function limparSessao() {
    try {
      localStorage.removeItem('portal_token');
      localStorage.removeItem('portal_user');
    } catch (_) {}
  }

  // ---- interface ----
  function mostrarErro(texto) {
    if (erroEl) erroEl.textContent = texto || '';
  }

  function escolherAba(aba) {
    const entrar = aba === 'entrar';
    formLogin?.classList.toggle('hidden', !entrar);
    formCadastro?.classList.toggle('hidden', entrar);
    abaEntrar?.classList.toggle('bg-brand-clay', entrar);
    abaEntrar?.classList.toggle('text-white', entrar);
    abaEntrar?.classList.toggle('bg-[#1f2e27]', !entrar);
    abaEntrar?.classList.toggle('text-stone-300', !entrar);
    abaCadastrar?.classList.toggle('bg-brand-clay', !entrar);
    abaCadastrar?.classList.toggle('text-white', !entrar);
    abaCadastrar?.classList.toggle('bg-[#1f2e27]', entrar);
    abaCadastrar?.classList.toggle('text-stone-300', entrar);
    mostrarErro('');
  }

  function abrirModalLogin(e, aba) {
    if (e && e.preventDefault) e.preventDefault();
    if (!modal) return;
    escolherAba(aba || 'entrar');
    modal.classList.remove('hidden');
    const campo = document.getElementById(
      aba === 'cadastrar' ? 'cad-username' : 'login-identifier'
    );
    campo?.focus();
  }

  function fecharModalLogin() {
    modal?.classList.add('hidden');
    mostrarErro('');
  }

  window.abrirModalLogin = abrirModalLogin;

  // Atualiza botão "Login"/"Sair", painel do gestor e chat conforme a sessão
  function atualizarInterface() {
    const sessao = lerSessao();
    const texto = sessao ? `Sair (${sessao.user.username})` : 'Login';
    if (btnLogin) btnLogin.textContent = texto;
    if (btnLoginMobile) btnLoginMobile.textContent = texto;

    const ehGestor = Boolean(sessao && sessao.user.role === 'Gestor');
    document.getElementById('painel-gestor')?.classList.toggle('hidden', !ehGestor);
    document.body.classList.toggle('modo-gestor', ehGestor);

    if (typeof window.atualizarEstadoChat === 'function') {
      window.atualizarEstadoChat();
    }
  }

  function aoClicarLogin(e) {
    e.preventDefault();
    if (lerSessao()) {
      sair();
    } else {
      abrirModalLogin(e, 'entrar');
    }
  }

  async function sair() {
    limparSessao();
    try {
      await fetch(`${API}/admin/logout`, { method: 'POST' }); // encerra o cookie do gestor
    } catch (_) {}
    atualizarInterface();
  }

  async function enviar(url, corpo, botao) {
    mostrarErro('');
    if (botao) botao.disabled = true;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok) {
        mostrarErro(dados.error || dados.message || 'Não foi possível continuar.');
        return;
      }
      gravarSessao(dados.token, dados.user);
      fecharModalLogin();
      formLogin?.reset();
      formCadastro?.reset();
      atualizarInterface();
    } catch (_) {
      mostrarErro('Erro de conexão. Tente novamente.');
    } finally {
      if (botao) botao.disabled = false;
    }
  }

  // ---- eventos ----
  btnLogin?.addEventListener('click', aoClicarLogin);
  btnLoginMobile?.addEventListener('click', (e) => {
    document.getElementById('mobile-menu')?.classList.add('hidden');
    aoClicarLogin(e);
  });

  document.getElementById('fechar-login')?.addEventListener('click', fecharModalLogin);
  document.getElementById('cancelar-login')?.addEventListener('click', fecharModalLogin);
  document.getElementById('cancelar-cadastro')?.addEventListener('click', fecharModalLogin);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) fecharModalLogin();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      fecharModalLogin();
    }
  });

  abaEntrar?.addEventListener('click', () => escolherAba('entrar'));
  abaCadastrar?.addEventListener('click', () => escolherAba('cadastrar'));

  formLogin?.addEventListener('submit', (e) => {
    e.preventDefault();
    enviar(
      `${API}/auth/login`,
      {
        identifier: document.getElementById('login-identifier').value.trim(),
        senha: document.getElementById('login-password').value,
      },
      formLogin.querySelector('button[type="submit"]')
    );
  });

  formCadastro?.addEventListener('submit', (e) => {
    e.preventDefault();
    enviar(
      `${API}/auth/register`,
      {
        username: document.getElementById('cad-username').value.trim(),
        email: document.getElementById('cad-email').value.trim(),
        senha: document.getElementById('cad-password').value,
      },
      formCadastro.querySelector('button[type="submit"]')
    );
  });

  // ---- ao carregar: confere se a sessão guardada ainda vale (o token expira em 8 horas) ----
  async function validarSessao() {
    const sessao = lerSessao();
    if (!sessao) return atualizarInterface();
    try {
      const res = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${sessao.token}` },
      });
      if (res.status === 401) limparSessao();
    } catch (_) {
      /* sem conexão: mantém a sessão por enquanto */
    }
    atualizarInterface();
  }

  validarSessao();
})();
