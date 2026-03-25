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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      burst_email: {
        Row: {
          cc_recipients: string | null
          created_at: string
          file_link: string | null
          guest_name: string | null
          id: number
          message: string
          sender_number: string | null
          subject: string
          to: string
        }
        Insert: {
          cc_recipients?: string | null
          created_at?: string
          file_link?: string | null
          guest_name?: string | null
          id?: number
          message: string
          sender_number?: string | null
          subject: string
          to: string
        }
        Update: {
          cc_recipients?: string | null
          created_at?: string
          file_link?: string | null
          guest_name?: string | null
          id?: number
          message?: string
          sender_number?: string | null
          subject?: string
          to?: string
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
      uploaded_documents: {
        Row: {
          chunk_count: number | null
          created_at: string
          document_category: string | null
          file_path: string
          file_size: number
          id: string
          last_accessed: string | null
          mime_type: string
          original_filename: string
          processed_at: string | null
          processing_error: string | null
          relevance_reason: string | null
          relevance_score: number | null
          session_id: string
          upload_status: string
        }
        Insert: {
          chunk_count?: number | null
          created_at?: string
          document_category?: string | null
          file_path: string
          file_size: number
          id?: string
          last_accessed?: string | null
          mime_type: string
          original_filename: string
          processed_at?: string | null
          processing_error?: string | null
          relevance_reason?: string | null
          relevance_score?: number | null
          session_id: string
          upload_status?: string
        }
        Update: {
          chunk_count?: number | null
          created_at?: string
          document_category?: string | null
          file_path?: string
          file_size?: number
          id?: string
          last_accessed?: string | null
          mime_type?: string
          original_filename?: string
          processed_at?: string | null
          processing_error?: string | null
          relevance_reason?: string | null
          relevance_score?: number | null
          session_id?: string
          upload_status?: string
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
    }
    Views: {
      [_ in never]: never
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
