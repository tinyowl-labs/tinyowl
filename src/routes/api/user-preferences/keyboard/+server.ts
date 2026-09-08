import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
	sanitizeKeyboardPrefs,
	serializeKeyboardPrefs,
} from "$lib/shortcuts/persist";

export const GET: RequestHandler = async ({ locals }) => {
	const {
		data: { user },
		error: authErr,
	} = await locals.supabase.auth.getUser();
	if (authErr || !user) {
		throw error(401, "Not signed in");
	}
	const keyboardPreferences = serializeKeyboardPrefs(
		sanitizeKeyboardPrefs(user.user_metadata?.keyboard_preferences),
	);
	return json({ keyboardPreferences });
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	const {
		data: { user },
		error: authErr,
	} = await locals.supabase.auth.getUser();
	if (authErr || !user) {
		throw error(401, "Not signed in");
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, "Invalid JSON");
	}

	const parsed = sanitizeKeyboardPrefs(
		(body as { keyboardPreferences?: unknown })?.keyboardPreferences ?? body,
	);
	const keyboardPreferences = serializeKeyboardPrefs(parsed);

	const { error: updateErr } = await locals.supabase.auth.updateUser({
		data: { keyboard_preferences: keyboardPreferences },
	});
	if (updateErr) {
		throw error(500, updateErr.message);
	}
	return json({ keyboardPreferences });
};
