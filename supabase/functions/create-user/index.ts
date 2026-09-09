import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) return jsonError("غير مصرح", 401);

    const { data: caller } = await callerClient.from("profiles")
      .select("id,role,hospital_id,is_active").eq("id", user.id).maybeSingle();
    if (!caller || !caller.is_active || !["admin","manager"].includes(caller.role)) {
      return jsonError("غير مصرح", 403);
    }

    const body = await req.json();
    const admin = createClient(url, serviceKey);
    const action = body.action || "create";

    if (action === "set_active") {
      const targetId = body.user_id;
      if (!targetId || targetId === user.id) return jsonError("لا يمكن تعطيل حسابك من هنا", 400);

      const { data: target } = await admin.from("profiles")
        .select("id,role,hospital_id").eq("id", targetId).maybeSingle();
      if (!target) return jsonError("المستخدم غير موجود", 404);

      if (caller.role === "manager" &&
          (target.hospital_id !== caller.hospital_id || target.role !== "staff")) {
        return jsonError("يمكن لمدير المستشفى إدارة موظفي مستشفاه فقط", 403);
      }
      if (caller.role === "admin" && target.role === "admin") {
        return jsonError("لا يمكن تعطيل حساب مدير عام من هذه الشاشة", 403);
      }

      const active = Boolean(body.is_active);
      const { error: pErr } = await admin.from("profiles").update({ is_active: active }).eq("id", targetId);
      if (pErr) return jsonError(pErr.message, 400);

      // Prevent a disabled account from retaining an active Supabase session.
      const { error: banError } = await admin.auth.admin.updateUserById(targetId, { ban_duration: active ? "none" : "876000h" });
      if (banError) {
        await admin.from("profiles").update({ is_active: !active }).eq("id", targetId);
        return jsonError("تعذر تغيير حالة جلسة المستخدم", 500);
      }

      return jsonOk({ success: true, is_active: active });
    }

    const { email, password, full_name, role, hospital_id, update, username, phone } = body;
    if (!email || !password) return jsonError("بيانات ناقصة", 400);

    let targetHospitalId = hospital_id || null;
    let targetRole = role;

    if (caller.role === "admin") {
      if (!update && !["manager","staff"].includes(role)) return jsonError("الصلاحية غير صحيحة", 400);
    } else {
      targetHospitalId = caller.hospital_id;
      if (!update && role !== "staff") return jsonError("يمكنك إنشاء موظفين فقط", 403);
      if (update) {
        const { data: target } = await callerClient.from("profiles")
          .select("hospital_id,role").eq("email", email).maybeSingle();
        if (!target || target.hospital_id !== caller.hospital_id || target.role !== "staff") {
          return jsonError("غير مصرح", 403);
        }
      }
    }

    if (update) {
      const { data: users, error: listError } = await admin.auth.admin.listUsers();
      if (listError) return jsonError("خطأ في الخادم", 500);
      const existing = users.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
      if (!existing) return jsonError("المستخدم غير موجود", 404);
      const { error } = await admin.auth.admin.updateUserById(existing.id, { password });
      if (error) return jsonError(error.message, 400);
      return jsonOk({ success: true });
    }

    const { data: newUser, error } = await admin.auth.admin.createUser({
      email: email.trim(), password, email_confirm: true,
      user_metadata: { role: targetRole, hospital_id: targetHospitalId, full_name }
    });
    if (error) {
      if (error.message.toLowerCase().includes("already")) return jsonError("هذا البريد مسجل مسبقاً", 409);
      return jsonError(error.message, 400);
    }

    // The signup trigger creates a harmless staff profile first. Only this
    // trusted service-role path assigns manager/staff + hospital membership.
    if (newUser.user?.id) {
      const { error: profileError } = await admin.from("profiles").update({
        role: targetRole,
        hospital_id: targetHospitalId,
        full_name: full_name || null,
        username: username || null,
        phone: phone || null,
        is_active: true,
      }).eq("id", newUser.user.id);
      if (profileError) {
        await admin.auth.admin.deleteUser(newUser.user.id);
        return jsonError("تعذر تجهيز ملف المستخدم، تم التراجع عن إنشاء الحساب", 500);
      }
    }

    return jsonOk({ success: true, user_id: newUser.user?.id });
  } catch {
    return jsonError("خطأ في الخادم", 500);
  }
});

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
