# نظام بنك الدم المركزي

نسخة مستقلة عن Bolt/StackBlitz. التطبيق يعمل محلياً باستخدام Vite/React، بينما بيانات النظام والمصادقة تستخدم مشروع Supabase المحدد في `.env.local`. لا يحتاج تشغيل Bolt أو StackBlitz.

## التشغيل المحلي

1. ثبّت Node.js 20 أو أحدث.
2. انسخ `.env.example` إلى `.env.local`.
3. ضع `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY` الخاصة بمشروع Supabase.
4. ثبّت الحزم: `npm install`
5. شغّل: `npm run dev`
6. افتح الرابط الذي يظهره Vite (غالباً `http://localhost:5173`).

## قاعدة البيانات

نفّذ ملفات `supabase/migrations` بالترتيب في مشروع Supabase. ملف `create-user` هو Edge Function المطلوبة لإنشاء حسابات مديري المستشفيات والموظفين.

## حساب المدير التجريبي

البريد: `admin@bloodbank.ye`
كلمة المرور: `admin123456`

## ملاحظات

- لا توجد حاجة إلى Bolt أو StackBlitz بعد تنزيل المشروع.
- لا تضع مفتاح `service_role` داخل `.env.local` أو داخل الواجهة؛ يبقى داخل إعدادات Edge Function فقط.
- عند إضافة مستشفى جديد من المدير العام، يجب إدخال بيانات مدير المستشفى، وسيُنشأ حسابه تلقائياً.
