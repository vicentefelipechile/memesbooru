// =========================================================================================================
// ROLE SETTINGS
// =========================================================================================================
// Administrator controls for roles, capabilities and memberships.
// =========================================================================================================

import { PERMISSIONS } from '../../validators';
import { api } from '../services/api.js';
import { escapeHtml } from './search.js';

type Roles = Awaited<ReturnType<typeof api.permissions.list>>['data'];

const PERMISSION_LABELS: Record<(typeof PERMISSIONS)[number], string> = {
	manage_roles: 'Administrar roles',
	moderate: 'Moderar contenido',
	edit_tags: 'Editar etiquetas y wiki',
	manage_artists: 'Administrar artistas',
	manage_forum: 'Moderar foro',
	upload_video: 'Subir videos',
	view_video: 'Ver videos',
	upload_without_cooldown: 'Subir sin espera',
	upload_post: 'Subir publicaciones',
	comment: 'Comentar',
	vote: 'Votar',
	favorite: 'Favoritos',
	report: 'Reportar',
	create_pool: 'Crear colecciones',
	create_topic: 'Crear temas',
	edit_wiki: 'Editar wiki',
	contact: 'Contactar',
};

export function renderPermissionSettings(roles: Roles): string {
	return `<section id="account-permissions" class="settings-section">
		<h2>Roles y permisos</h2>
		<p class="settings-help">Asigna varios roles por cuenta. Los permisos se suman y se actualizan en la siguiente petición.</p>
		<form id="role-form" class="form-stack">
			<label for="role-select">Rol<select id="role-select"><option value="">Nuevo rol</option>${roles.map((role) => `<option value="${role.id}">${escapeHtml(role.name)}</option>`).join('')}</select></label>
			<label for="role-name">Nombre<input id="role-name" maxlength="40" required></label>
			<fieldset><legend>Permisos</legend>${PERMISSIONS.filter((permission) => permission !== 'manage_roles')
				.map((permission) => `<label><input type="checkbox" name="permission" value="${permission}"> ${PERMISSION_LABELS[permission]}</label>`)
				.join('')}</fieldset>
			<button type="submit" class="primary">Guardar rol</button> <button id="role-delete" type="button">Eliminar rol</button>
		</form>
		<form id="role-member-form" class="form-stack">
			<h3>Asignar rol</h3>
			<label for="role-username">Nombre de usuario<input id="role-username" required></label>
			<label for="member-role">Rol<select id="member-role">${roles.map((role) => `<option value="${role.id}">${escapeHtml(role.name)}</option>`).join('')}</select></label>
			<button type="submit" class="primary">Asignar</button> <button id="role-revoke" type="button">Revocar</button>
		</form>
		<p id="role-status" class="form-msg" role="status" aria-live="polite"></p>
	</section>`;
}

export function bindPermissionSettings(initialRoles: Roles): void {
	let roles = initialRoles;
	const roleForm = document.getElementById('role-form');
	const select = document.getElementById('role-select');
	const name = document.getElementById('role-name');
	const memberRole = document.getElementById('member-role');
	const status = document.getElementById('role-status');
	if (!(roleForm instanceof HTMLFormElement) || !(select instanceof HTMLSelectElement) || !(name instanceof HTMLInputElement) || !(memberRole instanceof HTMLSelectElement) || !status) return;

	const message = (text: string, ok: boolean) => {
		status.textContent = text;
		status.className = `form-msg ${ok ? 'ok' : 'err'}`;
	};
	const refresh = async () => {
		roles = (await api.permissions.list()).data;
		select.innerHTML = `<option value="">Nuevo rol</option>${roles.map((role) => `<option value="${role.id}">${escapeHtml(role.name)}</option>`).join('')}`;
		memberRole.innerHTML = roles.map((role) => `<option value="${role.id}">${escapeHtml(role.name)}</option>`).join('');
		select.dispatchEvent(new Event('change'));
	};
	select.addEventListener('change', () => {
		const role = roles.find((item) => item.id === Number(select.value));
		name.value = role?.name ?? '';
		name.disabled = role?.managed === 1;
		const save = roleForm.querySelector<HTMLButtonElement>('button[type="submit"]');
		if (save) save.disabled = role?.managed === 1;
		for (const checkbox of Array.from(roleForm.querySelectorAll<HTMLInputElement>('input[name="permission"]'))) {
			checkbox.checked = role?.permissions.includes(checkbox.value as (typeof PERMISSIONS)[number]) ?? false;
			checkbox.disabled = role?.managed === 1;
		}
	});
	roleForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		try {
			const permissions = Array.from(roleForm.querySelectorAll<HTMLInputElement>('input[name="permission"]:checked')).map((input) => input.value);
			if (select.value) await api.permissions.update(Number(select.value), name.value.trim(), permissions);
			else await api.permissions.create(name.value.trim(), permissions);
			await refresh();
			message('Rol guardado.', true);
		} catch (error) {
			console.error('Role save failed', error);
			message('No se pudo guardar el rol.', false);
		}
	});
	document.getElementById('role-delete')?.addEventListener('click', async () => {
		if (!select.value) return;
		try {
			await api.permissions.delete(Number(select.value));
			await refresh();
			message('Rol eliminado.', true);
		} catch (error) {
			console.error('Role delete failed', error);
			message('No se pudo eliminar el rol.', false);
		}
	});
	const changeMember = async (revoke: boolean) => {
		const username = document.getElementById('role-username');
		if (!(username instanceof HTMLInputElement) || !username.value.trim()) return;
		try {
			const { profile } = await api.profiles.get(username.value.trim());
			if (revoke) await api.permissions.revoke(profile.id, Number(memberRole.value));
			else await api.permissions.assign(profile.id, Number(memberRole.value));
			message(revoke ? 'Rol revocado.' : 'Rol asignado.', true);
		} catch (error) {
			console.error('Role membership failed', error);
			message('No se pudo cambiar el rol de la cuenta.', false);
		}
	};
	document.getElementById('role-member-form')?.addEventListener('submit', (event) => {
		event.preventDefault();
		void changeMember(false);
	});
	document.getElementById('role-revoke')?.addEventListener('click', () => void changeMember(true));
}
