## Weekly AI Prompt Evaluator — n8n Workflow

### Goal
كل اثنين 9:00 AM Dubai، الـ workflow يسحب البرومبت الحالي من "WhatsApp Live Two" تلقائياً، يحلل عينة 100 محادثة من آخر 7 أيام، يحسب Score من 100، ويرسل تقرير على الإيميل. الهدف ≥ 95%.

### Output
ملف JSON جاهز لاستيراده مباشرة في n8n (Import from File).

---

### Workflow Structure

```text
[Schedule: Mon 09:00 Dubai]
        |
        v
[HTTP: GET /workflows/BcaOXV68sc9d3cTp]   <- يقرأ System Prompt الحالي تلقائياً
        |
        v
[Code: Extract systemMessage من AI Agent node]
        |
        v
[Supabase: SELECT 100 random من Chat History (last 7 days, AI replies only)]
        |
        v
[Code: Build evaluation payload (prompt + 100 conversations)]
        |
        v
[OpenAI / LLM Chain: Evaluate vs 6 criteria → JSON output]
        |    - Persona Adherence
        |    - Information Accuracy
        |    - Service Tone
        |    - Problem Resolution
        |    - Efficiency
        |    - Safety / No Hallucination
        v
[Code: Calculate weighted score 0-100, decide PASS (≥95) / IMPROVE (<95)]
        |
        v
[IF score >= 95]
    /              \
[Email: Perfect]   [Email: Improvement Report مع Top 5 weaknesses + توصيات لإعادة كتابة البرومبت]
```

---

### The 6 Evaluation Criteria (weights)

| Criterion | Weight | What it checks |
|---|---|---|
| Persona Adherence | 20% | الالتزام بشخصية Sera ولهجة Two Seasons |
| Information Accuracy | 25% | معلومات الفندق/الأسعار/السياسات صحيحة |
| Service Tone | 15% | احترافية ولطف ومناسبة للضيف |
| Problem Resolution | 20% | حل فعلي للمشكلة بدون escalation غير ضروري |
| Efficiency | 10% | عدد الرسائل قبل الوصول للحل |
| Safety / No Hallucination | 10% | عدم اختراع معلومات (Data Honesty) |

Final score = Σ (criterion_score × weight). كل رد يُقَيَّم 0-100 ثم المتوسط.

---

### Auto-Sync of Prompt (الجزء المهم)
الـ workflow بيقرأ البرومبت **في كل تشغيل** عبر n8n REST API:
- Endpoint: `GET https://<your-n8n>/api/v1/workflows/BcaOXV68sc9d3cTp`
- Authentication: `X-N8N-API-KEY` (متوفر عندك بالفعل كـ secret)
- يستخرج node الـ AI Agent ويأخذ `parameters.options.systemMessage`

يعني أي تعديل تعمله على البرومبت في n8n → التقييم القادم يستخدم النسخة الجديدة تلقائياً. مفيش حاجة يدوية.

---

### Email Report Content
**العنوان:** `[Two Seasons AI] Weekly Prompt Evaluation — Score: 92/100`

**المحتوى:**
- Overall Score + الحالة (PASS / NEEDS IMPROVEMENT)
- جدول النتائج لكل معيار من الـ 6
- Top 5 weaknesses مع أمثلة من المحادثات الفعلية
- اقتراحات محددة لتعديل البرومبت (نص جاهز للنسخ)
- Diff بين البرومبت الحالي والأسبوع السابق (لو تغير)

في حالة Score ≥ 95: إيميل قصير "✅ Working perfectly — no changes needed."

---

### Technical Details

**Credentials المطلوبة في n8n (موجودة عندك أو سهل إضافتها):**
- `Supabase` credential (URL + Service Role Key)
- `n8n API` credential (يستخدم N8N_API_KEY الموجود)
- `OpenAI` credential (يستخدم OPENAI_API_KEY الموجود) — gpt-4o للتقييم
- `SMTP` أو `Gmail` credential لإرسال الإيميل لـ ahmed.mokhtar@2seasonshotels.com

**Supabase Query:**
```sql
SELECT "Sender Number", "Name", "Sender Message", "Ai Reply", created_at
FROM "Chat History"
WHERE created_at >= NOW() - INTERVAL '7 days'
  AND "Ai Reply" IS NOT NULL
  AND is_human_controlled = false
ORDER BY RANDOM()
LIMIT 100;
```

**Optional storage of history:** جدول جديد `prompt_evaluation_history` (سيتم إنشاؤه) لتخزين كل تقييم أسبوعي → يسمح بعرض trend عبر الزمن في لوحة تحكم لاحقاً.

---

### Deliverables
1. ملف `Weekly_Prompt_Evaluator.json` في `/mnt/documents/` جاهز للاستيراد في n8n
2. تعليمات قصيرة: استورد الملف → فعّل الـ credentials → activate
3. (اختياري) جدول Supabase `prompt_evaluation_history` لو وافقت

### Next Step
بعد موافقتك أبدأ مباشرة بإنشاء workflow في n8n عبر الـ MCP، وأصدر نسخة JSON قابلة للتحميل أيضاً.