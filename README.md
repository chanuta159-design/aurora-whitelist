# 🛡️ Aurora Store — Whitelist & Request Manager

מערכת ניהול מבוססת Web, API ובינה מלאכותית (Gemini) עבור הפורק המסונן של **[Aurora Store](https://github.com/chanuta-dev/AuroraStore)**.

---

## 🔗 הקשר בין המאגרים (Ecosystem)

מאגר זה משמש כשרת אחורי (Backend), מאגר קבצי תצורה ולוח ניהול עבור אפליקציית האנדרואיד:

* **מאגר האפליקציה (Android Client):**  
  👉 https://github.com/chanuta-dev/AuroraStore
* **דשבורד ניהול פעיל (Vercel):**  
  👉 https://aurora-whitelist-chi.vercel.app

---

## 🛠️ תפקידי המאגר באקו-סיסטם

1. **מקור הרשימה הלבנה (Whitelist Source):**
   * מחזיק את `categorized-whitelist.json` ואת `whitelist.json`.
   * נקרא על ידי `WhitelistManager.kt` באפליקציית האנדרואיד לחסימה והצגה של אפליקציות מורשות בלבד.

2. **קבלת בקשות משתמשים (Request API):**
   * חושף נקודת קצה בכתובת `/api/request-app`.
   * קולט בקשות הנשלחות ממסך `AppRequestScreen` באפליקציה ושומר אותן ב-`pending-requests.json`.

3. **לוח בקרה למנהל (Web Dashboard):**
   * ממשק גרפי מודרני מבוסס Drag & Drop לסידור קטגוריות.
   * תיבת אישור/דחיית בקשות ממתינות עם מונה פופולריות (🔥).

4. **מנוע קטלוג אוטומטי (Gemini AI Engine):**
   * בעת שמירה, מופעלת פונקציית `/api/categorize-and-save`.
   * סורקת מידע מגוגל פליי ומ-CFOPUSER ומשבצת אוטומטית לקטגוריה הנכונה בעברית.
