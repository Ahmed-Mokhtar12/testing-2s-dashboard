
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, messageId } = await req.json();
    
    // Initialize Supabase client with service role key for full access
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('📩 Received Arabic message:', message);
    console.log('🔍 Message ID:', messageId);

    // Enhanced data fetching with better error handling and logging
    console.log('📊 Fetching comprehensive hotel data...');
    
    const [hotelReviews, chatHistory, infoSummary, conductedTraining, longTermMemory, vectorSearch] = await Promise.allSettled([
      supabase.from('Hotel Reviews').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('Chat History').select('*').order('created_at', { ascending: false }).limit(30),
      supabase.from('Info Summary').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('Conducted Training').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('LongTermMemory').select('*').order('created_at', { ascending: false }).limit(25),
      supabase.from('N8N_2S').select('*').order('created_at', { ascending: false }).limit(10)
    ]);

    // Enhanced logging with Arabic context
    console.log('📈 مراجعات الفندق:', hotelReviews.status === 'fulfilled' ? `${hotelReviews.value.data?.length || 0} سجل` : hotelReviews.reason);
    console.log('💬 تاريخ المحادثات:', chatHistory.status === 'fulfilled' ? `${chatHistory.value.data?.length || 0} سجل` : chatHistory.reason);
    console.log('📧 ملخص المعلومات:', infoSummary.status === 'fulfilled' ? `${infoSummary.value.data?.length || 0} سجل` : infoSummary.reason);
    console.log('🎓 التدريب المنجز:', conductedTraining.status === 'fulfilled' ? `${conductedTraining.value.data?.length || 0} سجل` : conductedTraining.reason);
    console.log('🧠 الذاكرة طويلة المدى:', longTermMemory.status === 'fulfilled' ? `${longTermMemory.value.data?.length || 0} سجل` : longTermMemory.reason);
    console.log('🔍 بحث المتجهات:', vectorSearch.status === 'fulfilled' ? `${vectorSearch.value.data?.length || 0} سجل` : vectorSearch.reason);

    // Build comprehensive Arabic hotel consultant context
    let context = `📩 دورك النظامي:
أنت مستشار ذكي متخصص في إدارة الفنادق على مستوى عالمي، مخصص بالكامل لفندق Two Seasons Hotel. أنت مستشار استراتيجي خبير في:
- عمليات الفندق وإدارة الضيوف
- تحسين تجربة الضيوف ومراجعاتهم
- التسويق الفندقي وإدارة الإيرادات
- تطوير الموظفين والأتمتة
- التحليل التنبؤي والتوصيات الاستراتيجية

🧠 الوعي السياقي والذاكرة:
يجب أن تتذكر جميع التفاعلات السابقة في المحادثة وتحافظ على الاستمرارية. استخدم الرؤى ذات الصلة وابني على النقاشات السابقة.

🗣️ أسلوب المحادثة:
تفاعل بشكل طبيعي باللغة العربية المهنية والودية. يجب أن تبدو ردودك إنسانية ودافئة وخبيرة، مثل مستشار كبير ينصح قيادة الفندق.

🎯 المهام الأساسية:
- الإجابة على جميع الأسئلة المتعلقة بعمليات الفندق والتسويق وخدمات الضيوف والأتمتة
- تقديم مشورة مدعومة بالبيانات
- اقتراح التحسينات لرضا الضيوف وكفاءة الموظفين وإيرادات الفندق

بيانات فندق Two Seasons الشاملة:

`;

    // Enhanced guest reviews analysis with insights
    if (hotelReviews.status === 'fulfilled' && hotelReviews.value.data && hotelReviews.value.data.length > 0) {
      context += "=== 📊 تحليل مراجعات الضيوف والتقييمات ===\n";
      hotelReviews.value.data.forEach((review, index) => {
        if (review['Reviews Summary']) {
          context += `${index + 1}. 📝 ${review['Reviews Summary']}\n`;
        }
      });
      context += "\n🔍 نصائح للتحسين: قم بتحليل هذه المراجعات لتحديد نقاط القوة والضعف وأقترح خطة عمل محددة.\n\n";
    }

    // Enhanced email communications context
    if (infoSummary.status === 'fulfilled' && infoSummary.value.data && infoSummary.value.data.length > 0) {
      context += "=== 📧 الاتصالات والمراسلات الإدارية ===\n";
      infoSummary.value.data.forEach((info, index) => {
        if (info['Email Summary']) {
          context += `${index + 1}. 📤 من: ${info['From'] || 'غير محدد'} | 📥 إلى: ${info['To'] || 'غير محدد'}\n   📄 الملخص: ${info['Email Summary']}\n`;
        }
      });
      context += "\n💡 استخدم هذه المعلومات لفهم التحديات الإدارية والفرص المتاحة.\n\n";
    }

    // Enhanced staff training and development context
    if (conductedTraining.status === 'fulfilled' && conductedTraining.value.data && conductedTraining.value.data.length > 0) {
      context += "=== 🎓 التدريب والتطوير المهني للموظفين ===\n";
      conductedTraining.value.data.forEach((training, index) => {
        if (training['Summary of the training']) {
          context += `${index + 1}. 📚 ${training['Summary of the training']}\n`;
        }
      });
      context += "\n🚀 اقترح برامج تدريبية إضافية بناءً على احتياجات الفندق الحالية.\n\n";
    }

    // Enhanced chat history with pattern analysis
    if (chatHistory.status === 'fulfilled' && chatHistory.value.data && chatHistory.value.data.length > 0) {
      context += "=== 💬 تاريخ المحادثات والاستفسارات الحديثة ===\n";
      chatHistory.value.data.slice(0, 15).forEach((chat, index) => {
        if (chat['Sender Message'] && chat['Ai Reply']) {
          context += `${index + 1}. 🔵 الضيف/الموظف: ${chat['Sender Message']}\n   🤖 الرد: ${chat['Ai Reply']}\n`;
        }
      });
      context += "\n📈 حلل الأنماط في الاستفسارات لتحديد القضايا المتكررة والحلول المطلوبة.\n\n";
    }

    // Enhanced conversation memory with continuity
    if (longTermMemory.status === 'fulfilled' && longTermMemory.value.data && longTermMemory.value.data.length > 0) {
      context += "=== 🧠 ذاكرة المحادثات والسياق التاريخي ===\n";
      longTermMemory.value.data.slice(-12).forEach((memory, index) => {
        if (memory.message) {
          context += `${index + 1}. 💭 ${memory.message}\n`;
        }
      });
      context += "\n🔄 حافظ على استمرارية المحادثة واستخدم هذا السياق لتقديم ردود متماسكة.\n\n";
    }

    // Enhanced vector search context
    if (vectorSearch.status === 'fulfilled' && vectorSearch.value.data && vectorSearch.value.data.length > 0) {
      context += "=== 🔍 بيانات البحث المتقدم والمحتوى ===\n";
      vectorSearch.value.data.forEach((doc, index) => {
        if (doc.content) {
          context += `${index + 1}. 📄 ${doc.content.substring(0, 200)}...\n`;
        }
      });
      context += "\n";
    }

    context += `=== 📋 التعليمات المحددة ===
- 🎯 استخدم البيانات المتاحة لتقديم مشورة دقيقة ومفيدة حول فندق Two Seasons
- 💡 إذا لم تتوفر معلومات محددة، اعترف بذلك واعرض المساعدة في العثور على المعلومات
- 🏨 كن مهنياً وودوداً ومركزاً على الضيافة في ردودك
- 📊 استخدم السياق المتاح لإعطاء إجابات مدروسة حول فندق Two Seasons
- 🤝 إذا كان لدى الضيف شكوى أو مشكلة، أظهر التفهم واعرض حلولاً عملية
- 📞 للاستفسارات حول الحجوزات، وجه الضيوف إلى القنوات المناسبة مع تقديم معلومات مفيدة
- 🔮 قدم توصيات استباقية لتحسين العمليات والخدمات
- 📈 اقترح استراتيجيات لزيادة الإيرادات ورضا الضيوف

سؤال الضيف/الإدارة الحالي: ${message}`;

    console.log('📏 طول السياق:', context.length, 'حرف');

    // Enhanced OpenAI API call with Arabic optimization
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!openAIApiKey) {
      throw new Error('مفتاح OpenAI API غير مكوّن');
    }

    console.log('🤖 استدعاء OpenAI API للمستشار العربي...');
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: context },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 1000,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
        // Arabic language optimization
        language: 'ar'
      }),
    });

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();
      console.error('❌ خطأ في OpenAI API:', openAIResponse.status, errorText);
      throw new Error(`خطأ في OpenAI API: ${openAIResponse.statusText}`);
    }

    const openAIData = await openAIResponse.json();
    const response = openAIData.choices[0].message.content;

    console.log('✅ تم إنتاج رد المستشار العربي بطول:', response.length, 'حرف');

    // Enhanced conversation storage with Arabic context
    try {
      const memoryResult = await supabase.from('LongTermMemory').insert({
        sender: 'مستخدم/ضيف',
        recipient: 'مستشار فندق Two Seasons الذكي',
        message: `👤 المستخدم: ${message}\n🤖 المستشار: ${response}`,
        created_at: new Date().toISOString()
      });

      if (memoryResult.error) {
        console.error('❌ خطأ في حفظ المحادثة:', memoryResult.error);
      } else {
        console.log('✅ تم حفظ المحادثة في الذاكرة طويلة المدى بنجاح');
      }
    } catch (memoryError) {
      console.error('❌ فشل في حفظ المحادثة:', memoryError);
    }

    // Enhanced response with Arabic metadata
    return new Response(JSON.stringify({ 
      response,
      messageId,
      timestamp: new Date().toISOString(),
      consultant: 'مستشار فندق Two Seasons الذكي',
      language: 'العربية',
      dataStats: {
        hotelReviews: hotelReviews.status === 'fulfilled' ? hotelReviews.value.data?.length || 0 : 0,
        chatHistory: chatHistory.status === 'fulfilled' ? chatHistory.value.data?.length || 0 : 0,
        infoSummary: infoSummary.status === 'fulfilled' ? infoSummary.value.data?.length || 0 : 0,
        conductedTraining: conductedTraining.status === 'fulfilled' ? conductedTraining.value.data?.length || 0 : 0,
        longTermMemory: longTermMemory.status === 'fulfilled' ? longTermMemory.value.data?.length || 0 : 0,
        vectorSearch: vectorSearch.status === 'fulfilled' ? vectorSearch.value.data?.length || 0 : 0
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ خطأ في وظيفة المستشار الذكي:', error);
    
    // Enhanced Arabic error messages
    let errorMessage = 'أعتذر، واجهت مشكلة في معالجة طلبك. يرجى المحاولة مرة أخرى.';
    
    if (error.message.includes('OpenAI')) {
      errorMessage = 'أواجه مشكلة في الاتصال بخدمة الذكاء الاصطناعي. يرجى المحاولة خلال لحظات.';
    } else if (error.message.includes('Supabase') || error.message.includes('database')) {
      errorMessage = 'أواجه مشكلة في الوصول إلى بيانات الفندق. يرجى المحاولة مرة أخرى.';
    }
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      messageId: Date.now().toString(),
      timestamp: new Date().toISOString(),
      consultant: 'مستشار فندق Two Seasons الذكي',
      language: 'العربية'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
