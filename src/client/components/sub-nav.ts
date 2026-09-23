// =========================================================================================================
// SUB-NAV
// Links for the section currently open in the persistent shell.
// =========================================================================================================

const LINKS: Record<string, [string, string][]> = {
	account: [
		['Inicio', '/account'],
		['Perfil', '/profile'],
		['Favoritos', '/favorites'],
		['Configuración', '/settings'],
		['Correo', '/mail'],
	],
	posts: [
		['Catálogo', '/posts'],
		['Subir', '/upload'],
		['Subir vídeo', '/upload/video'],
		['Mis favoritos', '/favorites'],
		['Aleatorio', '/random'],
	],
	comments: [
		['Lista', '/comments'],
		['Ayuda', '/help'],
	],
	wiki: [
		['Crear', '/wiki/create'],
		['Lista', '/wiki'],
	],
	aliases: [
		['Lista', '/aliases'],
		['Añadir', '/aliases/create'],
	],
	artists: [
		['Lista', '/artists'],
		['Añadir artista', '/artists/create'],
	],
	tags: [
		['Lista', '/tags'],
		['Editar', '/tags/edit'],
	],
	pools: [
		['Lista', '/pools'],
		['Crear', '/pools/create'],
	],
	forum: [
		['Lista', '/forum'],
		['Crear tema', '/forum/create'],
	],
	help: [
		['Ayuda', '/help'],
		['Contacto', '/contact'],
		['Acerca de', '/about'],
		['DMCA', '/dmca'],
		['TOS', '/tos'],
	],
};

export function navigationSection(pathname: string): string {
	const section = pathname.split('/')[1];

	if (['post', 'upload', 'favorites', 'random', 'top'].includes(section)) return 'posts';
	if (['profile', 'settings', 'mail', 'login', 'register', 'moderation'].includes(section)) return 'account';
	if (['contact', 'about', 'dmca', 'tos'].includes(section)) return 'help';

	return section in LINKS ? section : '';
}

export function renderSubNav(pathname: string): string {
	const section = navigationSection(pathname);
	const links = LINKS[section] ?? [
		['Inicio', '/'],
		['Catálogo', '/posts'],
		['Aleatorio', '/random'],
	];

	return `<nav class="site-subnav" aria-label="${section ? `Opciones de ${section}` : 'Inicio'}">${links.map(([label, href]) => `<a href="${href}" data-link>${label}</a>`).join('')}</nav>`;
}
