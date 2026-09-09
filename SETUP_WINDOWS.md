# تشغيل النظام على Windows بدون Bolt

## 1) المتطلبات
- Node.js 20 LTS أو أحدث.
- مشروع Supabase فعّال يحتوي على قاعدة البيانات والمصادقة.

## 2) إعداد متغيرات البيئة
في مجلد المشروع انسخ `.env.example` إلى `.env.local` ثم املأ:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

لا تضع `SUPABASE_SERVICE_ROLE_KEY` في `.env.local`؛ هذا المفتاح يجب أن يبقى داخل إعدادات Supabase Edge Function فقط.

## 3) قاعدة البيانات
نفّذ ملفات `supabase/migrations` بالترتيب الزمني في مشروع Supabase. آخر ملف يضيف تحسينات سلامة ويجعل ملخص توفر الدم مشتركاً بين المستخدمين المصادق عليهم دون كشف وحدات المستشفيات الأخرى.

## 4) Edge Function
انشر `supabase/functions/create-user` إلى Supabase، وتأكد أن المتغيرات السرية التالية متاحة للـFunction:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## 5) تشغيل الواجهة
من PowerShell داخل مجلد المشروع:

```powershell
npm install
npm run dev
```

ثم افتح عنوان Vite الظاهر في الطرفية، غالباً:

```text
http://localhost:5173
```

## 6) الاستخدام الأول
سجّل الدخول بحساب المدير الموجود في قاعدة البيانات:
- البريد: `admin@bloodbank.ye`
- كلمة المرور: `admin123456`

بعد تسجيل الدخول يستطيع المدير العام إضافة مستشفى، ويجب أن يدخل اسم مدير المستشفى وبريده وكلمة مروره. سيُنشأ حساب المدير ويرتبط بالمستشفى تلقائياً.

## ملاحظة مهمة
هذه النسخة **لا تعتمد على Bolt أو StackBlitz في التشغيل**. لكنها ما زالت تستخدم Supabase كمخزن بيانات ومصادقة. إذا كان المطلوب لاحقاً تشغيل النظام بالكامل داخل جهازك/شبكتك بدون أي خدمة Supabase خارجية، فهذه مرحلة منفصلة تتطلب نقل طبقة البيانات والمصادقة إلى PostgreSQL + Backend محلي.
