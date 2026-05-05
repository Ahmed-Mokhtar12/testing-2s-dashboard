export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      burst_email: {
        Row: {
          create_at: string | null
          file_link: string | null
          id: number
          message: string | null
          platform: string | null
          sender_id: string | null
          sender_name: string | null
          sender_number: string | null
          session_key: string | null
        }
        Insert: {
          create_at?: string | null
          file_link?: string | null
          id?: never
          message?: string | null
          platform?: string | null
          sender_id?: string | null
          sender_name?: string | null
          sender_number?: string | null
          session_key?: string | null
        }
        Update: {
          create_at?: string | null
          file_link?: string | null
          id?: never
          message?: string | null
          platform?: string | null
          sender_id?: string | null
          sender_name?: string | null
          sender_number?: string | null
          session_key?: string | null
        }
        Relationships: []
      }
      burst_messaging: {
        Row: {
          attachment_url: string | null
          created_at: string | null
          guest_display_name: string | null
          id: number
          long_term_memory: string | null
          message_caption: string | null
          message_text: string | null
          message_type: string | null
          sender_number: string | null
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string | null
          guest_display_name?: string | null
          id?: never
          long_term_memory?: string | null
          message_caption?: string | null
          message_text?: string | null
          message_type?: string | null
          sender_number?: string | null
        }
        Update: {
          attachment_url?: string | null
          created_at?: string | null
          guest_display_name?: string | null
          id?: never
          long_term_memory?: string | null
          message_caption?: string | null
          message_text?: string | null
          message_type?: string | null
          sender_number?: string | null
        }
        Relationships: []
      }
      burst_social_dm: {
        Row: {
          attachment_url: string | null
          claimed_at: string | null
          combined_input: string | null
          created_at: string
          id: number
          long_term_memory: string | null
          message_caption: string | null
          message_text: string | null
          message_type: string
          platform: string
          processed: boolean
          processed_at: string | null
          recipient_id: string | null
          sender_id: string
          sender_name: string | null
          session_key: string
        }
        Insert: {
          attachment_url?: string | null
          claimed_at?: string | null
          combined_input?: string | null
          created_at?: string
          id?: number
          long_term_memory?: string | null
          message_caption?: string | null
          message_text?: string | null
          message_type?: string
          platform: string
          processed?: boolean
          processed_at?: string | null
          recipient_id?: string | null
          sender_id: string
          sender_name?: string | null
          session_key: string
        }
        Update: {
          attachment_url?: string | null
          claimed_at?: string | null
          combined_input?: string | null
          created_at?: string
          id?: number
          long_term_memory?: string | null
          message_caption?: string | null
          message_text?: string | null
          message_type?: string
          platform?: string
          processed?: boolean
          processed_at?: string | null
          recipient_id?: string | null
          sender_id?: string
          sender_name?: string | null
          session_key?: string
        }
        Relationships: []
      }
      "Chat History": {
        Row: {
          "Ai Reply": string | null
          created_at: string
          human_reply: string | null
          id: number
          is_archived: boolean
          is_human_controlled: boolean
          Media: Json | null
          Name: string | null
          released_to_ai_at: string | null
          replied_by_name: string | null
          replied_by_user_id: string | null
          "Sender Message": string | null
          "Sender Number": string | null
        }
        Insert: {
          "Ai Reply"?: string | null
          created_at: string
          human_reply?: string | null
          id?: number
          is_archived?: boolean
          is_human_controlled?: boolean
          Media?: Json | null
          Name?: string | null
          released_to_ai_at?: string | null
          replied_by_name?: string | null
          replied_by_user_id?: string | null
          "Sender Message"?: string | null
          "Sender Number"?: string | null
        }
        Update: {
          "Ai Reply"?: string | null
          created_at?: string
          human_reply?: string | null
          id?: number
          is_archived?: boolean
          is_human_controlled?: boolean
          Media?: Json | null
          Name?: string | null
          released_to_ai_at?: string | null
          replied_by_name?: string | null
          replied_by_user_id?: string | null
          "Sender Message"?: string | null
          "Sender Number"?: string | null
        }
        Relationships: []
      }
      "Conducted Training": {
        Row: {
          created_at: string
          id: number
          "Summary of the training": string | null
        }
        Insert: {
          created_at?: string
          id?: number
          "Summary of the training"?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          "Summary of the training"?: string | null
        }
        Relationships: []
      }
      conducted_training: {
        Row: {
          created_at: string
          embedding: string | null
          id: number
          summary_of_the_training: string | null
        }
        Insert: {
          created_at: string
          embedding?: string | null
          id?: number
          summary_of_the_training?: string | null
        }
        Update: {
          created_at?: string
          embedding?: string | null
          id?: number
          summary_of_the_training?: string | null
        }
        Relationships: []
      }
      email_threads: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: number
          internet_message_id: string | null
          last_direction: string | null
          last_email_cc: string | null
          last_email_to: string | null
          last_guest_name: string | null
          last_subject_summary: string | null
          last_update_at: string | null
          normalized_category: string | null
          outlook_message_id: string | null
          sender_number: string
          sent_at: string | null
          status: string
          subject: string | null
          thread_key: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: number
          internet_message_id?: string | null
          last_direction?: string | null
          last_email_cc?: string | null
          last_email_to?: string | null
          last_guest_name?: string | null
          last_subject_summary?: string | null
          last_update_at?: string | null
          normalized_category?: string | null
          outlook_message_id?: string | null
          sender_number: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          thread_key: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: number
          internet_message_id?: string | null
          last_direction?: string | null
          last_email_cc?: string | null
          last_email_to?: string | null
          last_guest_name?: string | null
          last_subject_summary?: string | null
          last_update_at?: string | null
          normalized_category?: string | null
          outlook_message_id?: string | null
          sender_number?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          thread_key?: string
        }
        Relationships: []
      }
      info_email_audit_log: {
        Row: {
          action: string | null
          confidence: string | null
          created_at: string
          department: string | null
          error: string | null
          id: number
          override: boolean | null
          processed_at: string
          reason: string | null
          sender: string | null
          subject: string | null
        }
        Insert: {
          action?: string | null
          confidence?: string | null
          created_at?: string
          department?: string | null
          error?: string | null
          id?: number
          override?: boolean | null
          processed_at?: string
          reason?: string | null
          sender?: string | null
          subject?: string | null
        }
        Update: {
          action?: string | null
          confidence?: string | null
          created_at?: string
          department?: string | null
          error?: string | null
          id?: number
          override?: boolean | null
          processed_at?: string
          reason?: string | null
          sender?: string | null
          subject?: string | null
        }
        Relationships: []
      }
      khaldia_reviews: {
        Row: {
          Author: string | null
          created_at: string
          Date: string | null
          "Hotel Name": string | null
          id: number
          "Response Text": string | null
          Score: number | null
          Source: string | null
          Text: string | null
          Title: string | null
          URL: string | null
        }
        Insert: {
          Author?: string | null
          created_at?: string
          Date?: string | null
          "Hotel Name"?: string | null
          id?: number
          "Response Text"?: string | null
          Score?: number | null
          Source?: string | null
          Text?: string | null
          Title?: string | null
          URL?: string | null
        }
        Update: {
          Author?: string | null
          created_at?: string
          Date?: string | null
          "Hotel Name"?: string | null
          id?: number
          "Response Text"?: string | null
          Score?: number | null
          Source?: string | null
          Text?: string | null
          Title?: string | null
          URL?: string | null
        }
        Relationships: []
      }
      LongTermMemory: {
        Row: {
          created_at: string
          id: number
          message: string | null
          recipient: string | null
          sender: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          message?: string | null
          recipient?: string | null
          sender?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          message?: string | null
          recipient?: string | null
          sender?: string | null
        }
        Relationships: []
      }
      N8N_2S: {
        Row: {
          chunk_index: number | null
          content: string | null
          created_at: string
          document_id: string | null
          embedding: string | null
          id: number
          is_recent_context: boolean | null
          metadata: Json | null
        }
        Insert: {
          chunk_index?: number | null
          content?: string | null
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          id?: number
          is_recent_context?: boolean | null
          metadata?: Json | null
        }
        Update: {
          chunk_index?: number | null
          content?: string | null
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          id?: number
          is_recent_context?: boolean | null
          metadata?: Json | null
        }
        Relationships: []
      }
      n8n_chat_histories: {
        Row: {
          Date: string | null
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          Date?: string | null
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          Date?: string | null
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      prompt_evaluation_history: {
        Row: {
          agent_name: string
          conversations_evaluated: number
          created_at: string
          criteria_scores: Json
          date_range_end: string | null
          date_range_start: string | null
          evaluated_at: string
          evaluation_duration_ms: number | null
          evaluator_model: string
          id: string
          overall_score: number
          prompt_char_count: number
          prompt_diff_from_previous: string | null
          prompt_full_text: string
          prompt_version_hash: string
          raw_evaluator_output: Json | null
          recommendations: Json
          score_delta_from_previous: number | null
          status: string
          summary: string | null
          top_weaknesses: Json
          workflow_id: string
          workflow_name: string
        }
        Insert: {
          agent_name?: string
          conversations_evaluated?: number
          created_at?: string
          criteria_scores?: Json
          date_range_end?: string | null
          date_range_start?: string | null
          evaluated_at?: string
          evaluation_duration_ms?: number | null
          evaluator_model?: string
          id?: string
          overall_score: number
          prompt_char_count?: number
          prompt_diff_from_previous?: string | null
          prompt_full_text: string
          prompt_version_hash: string
          raw_evaluator_output?: Json | null
          recommendations?: Json
          score_delta_from_previous?: number | null
          status: string
          summary?: string | null
          top_weaknesses?: Json
          workflow_id: string
          workflow_name: string
        }
        Update: {
          agent_name?: string
          conversations_evaluated?: number
          created_at?: string
          criteria_scores?: Json
          date_range_end?: string | null
          date_range_start?: string | null
          evaluated_at?: string
          evaluation_duration_ms?: number | null
          evaluator_model?: string
          id?: string
          overall_score?: number
          prompt_char_count?: number
          prompt_diff_from_previous?: string | null
          prompt_full_text?: string
          prompt_version_hash?: string
          raw_evaluator_output?: Json | null
          recommendations?: Json
          score_delta_from_previous?: number | null
          status?: string
          summary?: string | null
          top_weaknesses?: Json
          workflow_id?: string
          workflow_name?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          Author: string | null
          Date: string | null
          "Hotel Name": string | null
          id: number
          Language: string | null
          "Response Text": string | null
          Score: number | null
          Source: string | null
          Text: string | null
          Title: string | null
          URL: string | null
        }
        Insert: {
          Author?: string | null
          Date?: string | null
          "Hotel Name"?: string | null
          id?: number
          Language?: string | null
          "Response Text"?: string | null
          Score?: number | null
          Source?: string | null
          Text?: string | null
          Title?: string | null
          URL?: string | null
        }
        Update: {
          Author?: string | null
          Date?: string | null
          "Hotel Name"?: string | null
          id?: number
          Language?: string | null
          "Response Text"?: string | null
          Score?: number | null
          Source?: string | null
          Text?: string | null
          Title?: string | null
          URL?: string | null
        }
        Relationships: []
      }
      social_engagement_logs: {
        Row: {
          attachment_url: string | null
          channel: string | null
          created_at: string
          escalation_flag: boolean | null
          event_type: string | null
          grouped_count: number | null
          guest_message_text: string | null
          has_attachment: boolean | null
          id: string
          latest_message_at: string | null
          notes: string | null
          platform: string | null
          recipient_id: string | null
          reply_text: string | null
          sender_id: string | null
          sender_name: string | null
          session_key: string | null
          source_message_ids: Json | null
          status: string | null
          workflow_id: string | null
          workflow_name: string | null
        }
        Insert: {
          attachment_url?: string | null
          channel?: string | null
          created_at?: string
          escalation_flag?: boolean | null
          event_type?: string | null
          grouped_count?: number | null
          guest_message_text?: string | null
          has_attachment?: boolean | null
          id?: string
          latest_message_at?: string | null
          notes?: string | null
          platform?: string | null
          recipient_id?: string | null
          reply_text?: string | null
          sender_id?: string | null
          sender_name?: string | null
          session_key?: string | null
          source_message_ids?: Json | null
          status?: string | null
          workflow_id?: string | null
          workflow_name?: string | null
        }
        Update: {
          attachment_url?: string | null
          channel?: string | null
          created_at?: string
          escalation_flag?: boolean | null
          event_type?: string | null
          grouped_count?: number | null
          guest_message_text?: string | null
          has_attachment?: boolean | null
          id?: string
          latest_message_at?: string | null
          notes?: string | null
          platform?: string | null
          recipient_id?: string | null
          reply_text?: string | null
          sender_id?: string | null
          sender_name?: string | null
          session_key?: string | null
          source_message_ids?: Json | null
          status?: string | null
          workflow_id?: string | null
          workflow_name?: string | null
        }
        Relationships: []
      }
      Sop: {
        Row: {
          department_name: string | null
          file_id: string
          id: string
          section: string | null
          sop: string | null
          title: string | null
        }
        Insert: {
          department_name?: string | null
          file_id: string
          id?: string
          section?: string | null
          sop?: string | null
          title?: string | null
        }
        Update: {
          department_name?: string | null
          file_id?: string
          id?: string
          section?: string | null
          sop?: string | null
          title?: string | null
        }
        Relationships: []
      }
      "Two Seasons Competitor Hotel room Rates": {
        Row: {
          accor_tax_type: string | null
          booking_url: string | null
          checkin_date: string
          checkout_date: string | null
          converted_price_aed: number | null
          created_at: string
          dry_run: boolean
          error_message: string | null
          execution_id: string | null
          generated_at: string
          hotel_name: string
          id: number
          is_lowest_for_day: boolean
          lowest_price_for_day_aed: number | null
          original_currency: string | null
          original_price: number | null
          parser_debug: Json | null
          raw_result: Json | null
          report_date: string
          request_id: string | null
          source_group: string | null
          status: string
          summary: Json | null
          updated_at: string
          workflow_id: string
          workflow_name: string | null
        }
        Insert: {
          accor_tax_type?: string | null
          booking_url?: string | null
          checkin_date: string
          checkout_date?: string | null
          converted_price_aed?: number | null
          created_at?: string
          dry_run?: boolean
          error_message?: string | null
          execution_id?: string | null
          generated_at: string
          hotel_name: string
          id?: number
          is_lowest_for_day?: boolean
          lowest_price_for_day_aed?: number | null
          original_currency?: string | null
          original_price?: number | null
          parser_debug?: Json | null
          raw_result?: Json | null
          report_date: string
          request_id?: string | null
          source_group?: string | null
          status: string
          summary?: Json | null
          updated_at?: string
          workflow_id: string
          workflow_name?: string | null
        }
        Update: {
          accor_tax_type?: string | null
          booking_url?: string | null
          checkin_date?: string
          checkout_date?: string | null
          converted_price_aed?: number | null
          created_at?: string
          dry_run?: boolean
          error_message?: string | null
          execution_id?: string | null
          generated_at?: string
          hotel_name?: string
          id?: number
          is_lowest_for_day?: boolean
          lowest_price_for_day_aed?: number | null
          original_currency?: string | null
          original_price?: number | null
          parser_debug?: Json | null
          raw_result?: Json | null
          report_date?: string
          request_id?: string | null
          source_group?: string | null
          status?: string
          summary?: Json | null
          updated_at?: string
          workflow_id?: string
          workflow_name?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      website_burst_whatsapp_message: {
        Row: {
          attachment_url: string | null
          created_at: string
          guest_display_name: string | null
          id: number
          long_term_memory: string | null
          message_caption: string | null
          message_text: string | null
          message_type: string | null
          sender_number: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          guest_display_name?: string | null
          id?: number
          long_term_memory?: string | null
          message_caption?: string | null
          message_text?: string | null
          message_type?: string | null
          sender_number: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          guest_display_name?: string | null
          id?: number
          long_term_memory?: string | null
          message_caption?: string | null
          message_text?: string | null
          message_type?: string | null
          sender_number?: string
        }
        Relationships: []
      }
      website_chat_messages: {
        Row: {
          created_at: string
          id: number
          message_direction: string
          message_text: string
          metadata: Json
          processed_at: string | null
          session_id: string
          source: string
        }
        Insert: {
          created_at?: string
          id?: number
          message_direction: string
          message_text: string
          metadata?: Json
          processed_at?: string | null
          session_id: string
          source?: string
        }
        Update: {
          created_at?: string
          id?: number
          message_direction?: string
          message_text?: string
          metadata?: Json
          processed_at?: string | null
          session_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_website_chat_messages_session"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "website_chat_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      website_chat_sessions: {
        Row: {
          country: string | null
          created_at: string
          first_page_url: string | null
          id: number
          language: string | null
          last_message_at: string
          phone: string | null
          session_id: string
          source: string
          status: string
          updated_at: string
          user_agent: string | null
          visitor_email: string | null
          visitor_name: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          first_page_url?: string | null
          id?: number
          language?: string | null
          last_message_at?: string
          phone?: string | null
          session_id: string
          source?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
          visitor_email?: string | null
          visitor_name?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          first_page_url?: string | null
          id?: number
          language?: string | null
          last_message_at?: string
          phone?: string | null
          session_id?: string
          source?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
          visitor_email?: string | null
          visitor_name?: string | null
        }
        Relationships: []
      }
      website_chats: {
        Row: {
          ai_response: string | null
          created_at: string
          id: string
          is_archived: boolean
          session_id: string
          user_id: string | null
          user_message: string | null
        }
        Insert: {
          ai_response?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          session_id: string
          user_id?: string | null
          user_message?: string | null
        }
        Update: {
          ai_response?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          session_id?: string
          user_id?: string | null
          user_message?: string | null
        }
        Relationships: []
      }
      website_email_threads: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: number
          internet_message_id: string | null
          last_direction: string | null
          last_email_cc: string | null
          last_email_to: string | null
          last_guest_name: string | null
          last_update_at: string
          normalized_category: string | null
          outlook_message_id: string | null
          phone: string | null
          sent_at: string | null
          session_id: string | null
          status: string
          subject: string | null
          thread_key: string
          visitor_email: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: number
          internet_message_id?: string | null
          last_direction?: string | null
          last_email_cc?: string | null
          last_email_to?: string | null
          last_guest_name?: string | null
          last_update_at?: string
          normalized_category?: string | null
          outlook_message_id?: string | null
          phone?: string | null
          sent_at?: string | null
          session_id?: string | null
          status?: string
          subject?: string | null
          thread_key: string
          visitor_email?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: number
          internet_message_id?: string | null
          last_direction?: string | null
          last_email_cc?: string | null
          last_email_to?: string | null
          last_guest_name?: string | null
          last_update_at?: string
          normalized_category?: string | null
          outlook_message_id?: string | null
          phone?: string | null
          sent_at?: string | null
          session_id?: string | null
          status?: string
          subject?: string | null
          thread_key?: string
          visitor_email?: string | null
        }
        Relationships: []
      }
      welcome_message_success_log: {
        Row: {
          arrival_date: string | null
          created_at: string
          departure_date: string | null
          execution_id: string | null
          full_name: string | null
          guest_id: string | null
          id: string
          mobile_number: string
          reservation_id: string | null
          room_number: string | null
          sent_at: string
          sent_date: string
          status: string
          workflow_id: string | null
        }
        Insert: {
          arrival_date?: string | null
          created_at?: string
          departure_date?: string | null
          execution_id?: string | null
          full_name?: string | null
          guest_id?: string | null
          id?: string
          mobile_number: string
          reservation_id?: string | null
          room_number?: string | null
          sent_at?: string
          sent_date?: string
          status?: string
          workflow_id?: string | null
        }
        Update: {
          arrival_date?: string | null
          created_at?: string
          departure_date?: string | null
          execution_id?: string | null
          full_name?: string | null
          guest_id?: string | null
          id?: string
          mobile_number?: string
          reservation_id?: string | null
          room_number?: string | null
          sent_at?: string
          sent_date?: string
          status?: string
          workflow_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      daily_welcome_message_stats: {
        Row: {
          sent_date: string | null
          successful_welcome_messages: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_recent_document_context: {
        Args: { limit_count?: number }
        Returns: {
          chunk_index: number
          content: string
          document_category: string
          document_filename: string
          relevance_score: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_conversation_human_controlled: {
        Args: { p_sender_number: string }
        Returns: boolean
      }
      is_hotel_staff: { Args: { _user_id: string }; Returns: boolean }
      mark_recent_document_context: {
        Args: { doc_id: string }
        Returns: undefined
      }
      match_documents: {
        Args: { filter?: Json; match_count?: number; query_embedding: string }
        Returns: {
          content: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
      N8N_2S: {
        Args: { filter: Json; match_count: number; query_embedding: string }
        Returns: {
          content: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff"],
    },
  },
} as const
