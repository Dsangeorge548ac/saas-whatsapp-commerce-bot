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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          ip_address: string | null
          resource: string
          target_user_id: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          resource: string
          target_user_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          resource?: string
          target_user_id?: string | null
          tenant_id?: string | null
        }
        Relationships: []
      }
      auth_rate_limits: {
        Row: {
          attempts: number
          key_hash: string
          scope: string
          window_started_at: string
        }
        Insert: {
          attempts?: number
          key_hash: string
          scope: string
          window_started_at?: string
        }
        Update: {
          attempts?: number
          key_hash?: string
          scope?: string
          window_started_at?: string
        }
        Relationships: []
      }
      bot_menu_items: {
        Row: {
          action: Database["public"]["Enums"]["menu_action"]
          category_id: string | null
          description: string | null
          id: string
          menu_id: string
          product_id: string | null
          sort_order: number
          target_menu_id: string | null
          tenant_id: string
          title: string
        }
        Insert: {
          action: Database["public"]["Enums"]["menu_action"]
          category_id?: string | null
          description?: string | null
          id?: string
          menu_id: string
          product_id?: string | null
          sort_order?: number
          target_menu_id?: string | null
          tenant_id: string
          title: string
        }
        Update: {
          action?: Database["public"]["Enums"]["menu_action"]
          category_id?: string | null
          description?: string | null
          id?: string
          menu_id?: string
          product_id?: string | null
          sort_order?: number
          target_menu_id?: string | null
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_menu_items_tenant_id_category_id_fkey"
            columns: ["tenant_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "bot_menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_menu_items_tenant_id_menu_id_fkey"
            columns: ["tenant_id", "menu_id"]
            isOneToOne: false
            referencedRelation: "bot_menus"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "bot_menu_items_tenant_id_product_id_fkey"
            columns: ["tenant_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "bot_menu_items_tenant_id_target_menu_id_fkey"
            columns: ["tenant_id", "target_menu_id"]
            isOneToOne: false
            referencedRelation: "bot_menus"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      bot_menus: {
        Row: {
          body: string
          button_label: string
          created_at: string
          id: string
          key: string
          tenant_id: string
          title: string
        }
        Insert: {
          body: string
          button_label?: string
          created_at?: string
          id?: string
          key: string
          tenant_id: string
          title: string
        }
        Update: {
          body?: string
          button_label?: string
          created_at?: string
          id?: string
          key?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_menus_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          tenant_id: string
          unit_price_snapshot: number
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          tenant_id: string
          unit_price_snapshot: number
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          tenant_id?: string
          unit_price_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_tenant_id_cart_id_fkey"
            columns: ["tenant_id", "cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "cart_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_tenant_id_product_id_fkey"
            columns: ["tenant_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          id: string
          session_id: string
          status: Database["public"]["Enums"]["cart_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          session_id: string
          status?: Database["public"]["Enums"]["cart_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["cart_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_tenant_id_session_id_fkey"
            columns: ["tenant_id", "session_id"]
            isOneToOne: false
            referencedRelation: "conversation_sessions"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      catalog_publication_items: {
        Row: {
          product_id: string
          publication_id: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          product_id: string
          publication_id: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          product_id?: string
          publication_id?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_publication_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_publication_items_tenant_id_product_id_fkey"
            columns: ["tenant_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "catalog_publication_items_tenant_id_publication_id_fkey"
            columns: ["tenant_id", "publication_id"]
            isOneToOne: false
            referencedRelation: "catalog_publications"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      catalog_publications: {
        Row: {
          cover_path: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          published_at: string | null
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          cover_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          published_at?: string | null
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          cover_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          published_at?: string | null
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_publications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_publications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_sessions: {
        Row: {
          assigned_to: string | null
          closed_at: string | null
          created_at: string
          customer_id: string
          expires_at: string | null
          handoff_requested_at: string | null
          id: string
          last_inbound_at: string | null
          mode: Database["public"]["Enums"]["session_mode"]
          state: Database["public"]["Enums"]["session_state"]
          state_context: Json
          tenant_id: string
          updated_at: string
          version: number
          window_expires_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          closed_at?: string | null
          created_at?: string
          customer_id: string
          expires_at?: string | null
          handoff_requested_at?: string | null
          id?: string
          last_inbound_at?: string | null
          mode?: Database["public"]["Enums"]["session_mode"]
          state?: Database["public"]["Enums"]["session_state"]
          state_context?: Json
          tenant_id: string
          updated_at?: string
          version?: number
          window_expires_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          closed_at?: string | null
          created_at?: string
          customer_id?: string
          expires_at?: string | null
          handoff_requested_at?: string | null
          id?: string
          last_inbound_at?: string | null
          mode?: Database["public"]["Enums"]["session_mode"]
          state?: Database["public"]["Enums"]["session_state"]
          state_context?: Json
          tenant_id?: string
          updated_at?: string
          version?: number
          window_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_sessions_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_sessions_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "conversation_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address_text: string
          created_at: string
          customer_id: string
          id: string
          lat: number | null
          lng: number | null
          reference: string | null
          tenant_id: string
        }
        Insert: {
          address_text: string
          created_at?: string
          customer_id: string
          id?: string
          lat?: number | null
          lng?: number | null
          reference?: string | null
          tenant_id: string
        }
        Update: {
          address_text?: string
          created_at?: string
          customer_id?: string
          id?: string
          lat?: number | null
          lng?: number | null
          reference?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "customer_addresses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          anonymized_at: string | null
          created_at: string
          id: string
          opted_out: boolean
          phone_e164: string
          profile_name: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          anonymized_at?: string | null
          created_at?: string
          id?: string
          opted_out?: boolean
          phone_e164: string
          profile_name?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          anonymized_at?: string | null
          created_at?: string
          id?: string
          opted_out?: boolean
          phone_e164?: string
          profile_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      message_template_defaults: {
        Row: {
          allowed_placeholders: string[]
          body: string
          business_type: string
          description: string
          id: string
          key: string
          locale: string
          required_placeholders: string[]
          sort_order: number
          stage: string
        }
        Insert: {
          allowed_placeholders?: string[]
          body: string
          business_type?: string
          description: string
          id?: string
          key: string
          locale?: string
          required_placeholders?: string[]
          sort_order?: number
          stage: string
        }
        Update: {
          allowed_placeholders?: string[]
          body?: string
          business_type?: string
          description?: string
          id?: string
          key?: string
          locale?: string
          required_placeholders?: string[]
          sort_order?: number
          stage?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string | null
          created_at: string
          customer_id: string
          delivery_status: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          id: string
          message_type: Database["public"]["Enums"]["message_type"]
          payload: Json
          sender_type: Database["public"]["Enums"]["sender_type"]
          sender_user_id: string | null
          session_id: string | null
          tenant_id: string
          wamid: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          customer_id: string
          delivery_status?: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          id?: string
          message_type?: Database["public"]["Enums"]["message_type"]
          payload?: Json
          sender_type: Database["public"]["Enums"]["sender_type"]
          sender_user_id?: string | null
          session_id?: string | null
          tenant_id: string
          wamid?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          customer_id?: string
          delivery_status?: string | null
          direction?: Database["public"]["Enums"]["message_direction"]
          id?: string
          message_type?: Database["public"]["Enums"]["message_type"]
          payload?: Json
          sender_type?: Database["public"]["Enums"]["sender_type"]
          sender_user_id?: string | null
          session_id?: string | null
          tenant_id?: string
          wamid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_session_id_fkey"
            columns: ["tenant_id", "session_id"]
            isOneToOne: false
            referencedRelation: "conversation_sessions"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          tenant_id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          tenant_id: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          tenant_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          line_total: number
          order_id: string
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          tenant_id: string
          unit_price: number
        }
        Insert: {
          id?: string
          line_total: number
          order_id: string
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          tenant_id: string
          unit_price: number
        }
        Update: {
          id?: string
          line_total?: number
          order_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_tenant_id_order_id_fkey"
            columns: ["tenant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "order_items_tenant_id_product_id_fkey"
            columns: ["tenant_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          actor_type: Database["public"]["Enums"]["sender_type"]
          actor_user_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: string
          order_id: string
          reason: string | null
          tenant_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          actor_type: Database["public"]["Enums"]["sender_type"]
          actor_user_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          order_id: string
          reason?: string | null
          tenant_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          actor_type?: Database["public"]["Enums"]["sender_type"]
          actor_user_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          order_id?: string
          reason?: string | null
          tenant_id?: string
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_tenant_id_order_id_fkey"
            columns: ["tenant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          currency: string
          customer_id: string
          customer_name_snapshot: string | null
          customer_phone_snapshot: string
          delivery_address_text: string | null
          delivery_fee: number
          delivery_lat: number | null
          delivery_lng: number | null
          delivery_notes: string | null
          fulfillment: Database["public"]["Enums"]["delivery_mode"]
          id: string
          order_number: number
          payment_details_snapshot: Json
          payment_method_type: Database["public"]["Enums"]["payment_method_type"]
          placed_at: string
          session_id: string | null
          source_wamid: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency: string
          customer_id: string
          customer_name_snapshot?: string | null
          customer_phone_snapshot: string
          delivery_address_text?: string | null
          delivery_fee?: number
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_notes?: string | null
          fulfillment: Database["public"]["Enums"]["delivery_mode"]
          id?: string
          order_number: number
          payment_details_snapshot?: Json
          payment_method_type: Database["public"]["Enums"]["payment_method_type"]
          placed_at?: string
          session_id?: string | null
          source_wamid?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tenant_id: string
          total: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          customer_id?: string
          customer_name_snapshot?: string | null
          customer_phone_snapshot?: string
          delivery_address_text?: string | null
          delivery_fee?: number
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_notes?: string | null
          fulfillment?: Database["public"]["Enums"]["delivery_mode"]
          id?: string
          order_number?: number
          payment_details_snapshot?: Json
          payment_method_type?: Database["public"]["Enums"]["payment_method_type"]
          placed_at?: string
          session_id?: string | null
          source_wamid?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_session_id_fkey"
            columns: ["tenant_id", "session_id"]
            isOneToOne: false
            referencedRelation: "conversation_sessions"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      payment_proofs: {
        Row: {
          amount_declared: number | null
          created_at: string
          id: string
          order_id: string
          reference_number: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["proof_status"]
          storage_path: string | null
          tenant_id: string
        }
        Insert: {
          amount_declared?: number | null
          created_at?: string
          id?: string
          order_id: string
          reference_number?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["proof_status"]
          storage_path?: string | null
          tenant_id: string
        }
        Update: {
          amount_declared?: number | null
          created_at?: string
          id?: string
          order_id?: string
          reference_number?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["proof_status"]
          storage_path?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_proofs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_proofs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_proofs_tenant_id_order_id_fkey"
            columns: ["tenant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          failure_reason: string | null
          hosted_invoice_url: string | null
          id: string
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_invoice_id: string
          tenant_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency: string
          failure_reason?: string | null
          hosted_invoice_url?: string | null
          id?: string
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_invoice_id: string
          tenant_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          hosted_invoice_url?: string | null
          id?: string
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_invoice_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          id: string
          is_active: boolean
          max_orders_per_month: number | null
          max_users: number | null
          monthly_price_cents: number
          name: string
          sort_order: number
          stripe_lookup_key: string | null
        }
        Insert: {
          id: string
          is_active?: boolean
          max_orders_per_month?: number | null
          max_users?: number | null
          monthly_price_cents: number
          name: string
          sort_order?: number
          stripe_lookup_key?: string | null
        }
        Update: {
          id?: string
          is_active?: boolean
          max_orders_per_month?: number | null
          max_users?: number | null
          monthly_price_cents?: number
          name?: string
          sort_order?: number
          stripe_lookup_key?: string | null
        }
        Relationships: []
      }
      platform_access_log: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          reason: string | null
          resource: string
          resource_id: string | null
          tenant_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          resource: string
          resource_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          resource?: string
          resource_id?: string | null
          tenant_id?: string | null
        }
        Relationships: []
      }
      platform_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          role: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          role: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["platform_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_path: string | null
          is_available: boolean
          name: string
          price: number
          price_visible: boolean
          sku: string | null
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          is_available?: boolean
          name: string
          price: number
          price_visible?: boolean
          sku?: string | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          is_available?: boolean
          name?: string
          price?: number
          price_visible?: boolean
          sku?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_category_id_fkey"
            columns: ["tenant_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          email: string
          first_name?: string
          id: string
          last_name?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          event_id: string
          processed_at: string
          type: string
        }
        Insert: {
          event_id: string
          processed_at?: string
          type: string
        }
        Update: {
          event_id?: string
          processed_at?: string
          type?: string
        }
        Relationships: []
      }
      tenant_branding: {
        Row: {
          accent_color: string | null
          display_name: string
          logo_path: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          display_name: string
          logo_path?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          display_name?: string
          logo_path?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_branding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_business_hours: {
        Row: {
          closes_at: string | null
          is_open: boolean
          opens_at: string | null
          tenant_id: string
          weekday: number
        }
        Insert: {
          closes_at?: string | null
          is_open?: boolean
          opens_at?: string | null
          tenant_id: string
          weekday: number
        }
        Update: {
          closes_at?: string | null
          is_open?: boolean
          opens_at?: string | null
          tenant_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_business_hours_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_counters: {
        Row: {
          order_seq: number
          tenant_id: string
        }
        Insert: {
          order_seq?: number
          tenant_id: string
        }
        Update: {
          order_seq?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          invited_by: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_messages: {
        Row: {
          body: string
          is_enabled: boolean
          key: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          is_enabled?: boolean
          key: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          is_enabled?: boolean
          key?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_messages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_payment_methods: {
        Row: {
          created_at: string
          currency: string
          details: Json
          id: string
          is_active: boolean
          label: string
          sort_order: number
          tenant_id: string
          type: Database["public"]["Enums"]["payment_method_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          details?: Json
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          tenant_id: string
          type: Database["public"]["Enums"]["payment_method_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          details?: Json
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          tenant_id?: string
          type?: Database["public"]["Enums"]["payment_method_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_payment_methods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          accepts_delivery: boolean
          accepts_pickup: boolean
          bot_enabled: boolean
          bot_tested_at: string | null
          business_type: Database["public"]["Enums"]["business_type"]
          created_at: string
          currency: string
          delivery_fee: number
          go_live_at: string | null
          hours_enabled: boolean
          locale: string
          messages_reviewed_at: string | null
          require_delivery_location: boolean
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          accepts_delivery?: boolean
          accepts_pickup?: boolean
          bot_enabled?: boolean
          bot_tested_at?: string | null
          business_type?: Database["public"]["Enums"]["business_type"]
          created_at?: string
          currency?: string
          delivery_fee?: number
          go_live_at?: string | null
          hours_enabled?: boolean
          locale?: string
          messages_reviewed_at?: string | null
          require_delivery_location?: boolean
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          accepts_delivery?: boolean
          accepts_pickup?: boolean
          bot_enabled?: boolean
          bot_tested_at?: string | null
          business_type?: Database["public"]["Enums"]["business_type"]
          created_at?: string
          currency?: string
          delivery_fee?: number
          go_live_at?: string | null
          hours_enabled?: boolean
          locale?: string
          messages_reviewed_at?: string | null
          require_delivery_location?: boolean
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscriptions: {
        Row: {
          activated_at: string | null
          billing_cycle_anchor: string | null
          billing_interval: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          comp_access_until: string | null
          current_period_end: string | null
          current_period_start: string | null
          past_due_since: string | null
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          billing_cycle_anchor?: string | null
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          comp_access_until?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          past_due_since?: string | null
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          billing_cycle_anchor?: string | null
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          comp_access_until?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          past_due_since?: string | null
          plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_whatsapp_accounts: {
        Row: {
          access_token_secret_id: string | null
          connected_at: string | null
          created_at: string
          display_phone: string | null
          id: string
          last_checked_at: string | null
          last_error: string | null
          phone_number_id: string
          status: Database["public"]["Enums"]["whatsapp_status"]
          tenant_id: string
          updated_at: string
          waba_id: string
        }
        Insert: {
          access_token_secret_id?: string | null
          connected_at?: string | null
          created_at?: string
          display_phone?: string | null
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          phone_number_id: string
          status?: Database["public"]["Enums"]["whatsapp_status"]
          tenant_id: string
          updated_at?: string
          waba_id: string
        }
        Update: {
          access_token_secret_id?: string | null
          connected_at?: string | null
          created_at?: string
          display_phone?: string | null
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          phone_number_id?: string
          status?: Database["public"]["Enums"]["whatsapp_status"]
          tenant_id?: string
          updated_at?: string
          waba_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_whatsapp_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      web_order_links: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          publication_id: string | null
          session_id: string
          submitted_at: string | null
          tenant_id: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          publication_id?: string | null
          session_id: string
          submitted_at?: string | null
          tenant_id: string
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          publication_id?: string | null
          session_id?: string
          submitted_at?: string | null
          tenant_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_order_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_order_links_tenant_id_publication_id_fkey"
            columns: ["tenant_id", "publication_id"]
            isOneToOne: false
            referencedRelation: "catalog_publications"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "web_order_links_tenant_id_session_id_fkey"
            columns: ["tenant_id", "session_id"]
            isOneToOne: false
            referencedRelation: "conversation_sessions"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          attempts: number
          event_key: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          received_at: string
          status: Database["public"]["Enums"]["webhook_status"]
          tenant_id: string | null
        }
        Insert: {
          attempts?: number
          event_key: string
          id?: string
          last_error?: string | null
          payload: Json
          processed_at?: string | null
          received_at?: string
          status?: Database["public"]["Enums"]["webhook_status"]
          tenant_id?: string | null
        }
        Update: {
          attempts?: number
          event_key?: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
          status?: Database["public"]["Enums"]["webhook_status"]
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string }
      activate_bot: { Args: { p_tenant: string }; Returns: undefined }
      admin_assign_plan: {
        Args: { p_plan: string; p_tenant: string; p_until: string }
        Returns: undefined
      }
      admin_get_user: { Args: { p_user: string }; Returns: Json }
      admin_list_subscriptions: {
        Args: {
          p_limit: number
          p_offset: number
          p_plan: string
          p_search: string
          p_status: string
        }
        Returns: Json
      }
      admin_list_users: {
        Args: {
          p_filter: string
          p_limit: number
          p_offset: number
          p_search: string
        }
        Returns: Json
      }
      admin_set_platform_role: {
        Args: { p_role: string; p_user: string }
        Returns: undefined
      }
      admin_set_user_disabled: {
        Args: { p_disabled: boolean; p_user: string }
        Returns: undefined
      }
      admin_subscription_kpis: { Args: never; Returns: Json }
      admin_update_tenant: {
        Args: { p_name: string; p_status: string; p_tenant: string }
        Returns: undefined
      }
      admin_update_user: {
        Args: {
          p_email: string
          p_email_confirmed: boolean
          p_first: string
          p_last: string
          p_user: string
        }
        Returns: undefined
      }
      admin_update_user_name: {
        Args: { p_first: string; p_last: string; p_user: string }
        Returns: undefined
      }
      advance_order: {
        Args: {
          p_order: string
          p_reason?: string
          p_to: Database["public"]["Enums"]["order_status"]
        }
        Returns: undefined
      }
      advance_order_system: {
        Args: {
          p_actor: Database["public"]["Enums"]["sender_type"]
          p_order: string
          p_reason?: string
          p_to: Database["public"]["Enums"]["order_status"]
        }
        Returns: undefined
      }
      can_operate: { Args: { p_tenant: string }; Returns: boolean }
      can_view_operations: { Args: { p_tenant: string }; Returns: boolean }
      claim_session: { Args: { p_session: string }; Returns: undefined }
      create_default_menu: { Args: { p_tenant: string }; Returns: undefined }
      create_order_from_cart: {
        Args: {
          p_address: string
          p_cart: string
          p_fulfillment: Database["public"]["Enums"]["delivery_mode"]
          p_lat?: number
          p_lng?: number
          p_notes: string
          p_payment_method: string
          p_source_wamid: string
        }
        Returns: string
      }
      create_tenant: {
        Args: {
          p_business_type: Database["public"]["Enums"]["business_type"]
          p_name: string
        }
        Returns: string
      }
      create_web_order_link: {
        Args: { p_publication: string; p_session: string }
        Returns: string
      }
      expire_unpaid_orders: { Args: { p_hours?: number }; Returns: number }
      get_invitation_preview: { Args: { p_token: string }; Returns: Json }
      get_my_workspace: { Args: never; Returns: Json }
      get_onboarding_status: { Args: { p_tenant: string }; Returns: Json }
      get_open_status: {
        Args: { p_at?: string; p_tenant: string }
        Returns: Json
      }
      get_or_create_session: {
        Args: { p_customer: string; p_tenant: string }
        Returns: {
          assigned_to: string | null
          closed_at: string | null
          created_at: string
          customer_id: string
          expires_at: string | null
          handoff_requested_at: string | null
          id: string
          last_inbound_at: string | null
          mode: Database["public"]["Enums"]["session_mode"]
          state: Database["public"]["Enums"]["session_state"]
          state_context: Json
          tenant_id: string
          updated_at: string
          version: number
          window_expires_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "conversation_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_public_cover_image: {
        Args: { p_publication: string }
        Returns: string
      }
      get_public_product_image: { Args: { p_product: string }; Returns: string }
      get_public_publication: {
        Args: { p_publication: string; p_slug: string }
        Returns: Json
      }
      get_public_storefront: { Args: { p_slug: string }; Returns: Json }
      get_whatsapp_credentials: {
        Args: { p_tenant: string }
        Returns: {
          access_token: string
          phone_number_id: string
          status: Database["public"]["Enums"]["whatsapp_status"]
        }[]
      }
      invite_operator: {
        Args: { p_email: string; p_tenant: string }
        Returns: string
      }
      is_developer: { Args: never; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_tenant_member: { Args: { p_tenant: string }; Returns: boolean }
      is_tenant_owner: { Args: { p_tenant: string }; Returns: boolean }
      log_audit: {
        Args: {
          p_action: string
          p_actor: string
          p_details?: Json
          p_ip?: string
          p_resource: string
          p_target?: string
          p_tenant?: string
        }
        Returns: undefined
      }
      notify_tenant_members: {
        Args: {
          p_kind: string
          p_link: string
          p_tenant: string
          p_title: string
        }
        Returns: undefined
      }
      pause_bot: { Args: { p_tenant: string }; Returns: undefined }
      release_session: { Args: { p_session: string }; Returns: undefined }
      remove_operator: {
        Args: { p_tenant: string; p_user: string }
        Returns: undefined
      }
      reset_attempts: {
        Args: { p_key_hash: string; p_scope: string }
        Returns: undefined
      }
      review_proof: {
        Args: { p_decision: string; p_proof: string; p_reason?: string }
        Returns: undefined
      }
      revoke_invitation: { Args: { p_invitation: string }; Returns: undefined }
      save_main_menu: {
        Args: {
          p_body: string
          p_button_label: string
          p_items: Json
          p_tenant: string
        }
        Returns: undefined
      }
      session_transition_allowed: {
        Args: {
          p_from: Database["public"]["Enums"]["session_state"]
          p_to: Database["public"]["Enums"]["session_state"]
        }
        Returns: boolean
      }
      set_business_hours: {
        Args: { p_days: Json; p_enabled: boolean; p_tenant: string }
        Returns: undefined
      }
      set_whatsapp_account: {
        Args: {
          p_display_phone: string
          p_phone_number_id: string
          p_tenant: string
          p_token: string
          p_waba: string
        }
        Returns: string
      }
      set_whatsapp_status: {
        Args: {
          p_error?: string
          p_status: Database["public"]["Enums"]["whatsapp_status"]
          p_tenant: string
        }
        Returns: undefined
      }
      shares_tenant_with: { Args: { p_user: string }; Returns: boolean }
      submit_web_order: {
        Args: { p_items: Json; p_token: string }
        Returns: Json
      }
      take_attempt: {
        Args: {
          p_key_hash: string
          p_max: number
          p_scope: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      tenant_has_user_slot: {
        Args: { p_pending: boolean; p_tenant: string }
        Returns: boolean
      }
      tenant_is_billable: { Args: { p_tenant: string }; Returns: boolean }
      tenant_is_open_now: { Args: { p_tenant: string }; Returns: boolean }
    }
    Enums: {
      business_type: "restaurant" | "store" | "company" | "other"
      cart_status: "active" | "converted" | "abandoned"
      delivery_mode: "delivery" | "pickup"
      menu_action:
        | "submenu"
        | "show_category"
        | "show_product"
        | "business_info"
        | "request_agent"
        | "start_order"
      message_direction: "inbound" | "outbound"
      message_type:
        | "text"
        | "interactive"
        | "image"
        | "document"
        | "location"
        | "template"
        | "status"
        | "other"
      order_status:
        | "awaiting_payment"
        | "pending"
        | "approved"
        | "on_the_way"
        | "delivered"
        | "cancelled"
      payment_method_type:
        | "bank_transfer"
        | "pago_movil"
        | "zelle"
        | "usdt"
        | "cash"
        | "other"
      payment_status: "pending" | "paid" | "failed" | "refunded"
      platform_role: "developer" | "platform_admin"
      proof_status: "submitted" | "accepted" | "rejected"
      sender_type: "customer" | "bot" | "operator" | "system"
      session_mode: "bot" | "human"
      session_state:
        | "idle"
        | "browsing_menu"
        | "browsing_catalog"
        | "building_cart"
        | "awaiting_cart_confirmation"
        | "awaiting_address"
        | "awaiting_location"
        | "awaiting_notes"
        | "awaiting_payment_method"
        | "awaiting_proof"
        | "awaiting_review"
        | "human_handoff"
        | "closed"
      subscription_status:
        | "incomplete"
        | "incomplete_expired"
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "paused"
      tenant_role: "owner" | "operator"
      tenant_status: "active" | "suspended"
      webhook_status: "received" | "processed" | "failed"
      whatsapp_status: "pending" | "connected" | "error"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      business_type: ["restaurant", "store", "company", "other"],
      cart_status: ["active", "converted", "abandoned"],
      delivery_mode: ["delivery", "pickup"],
      menu_action: [
        "submenu",
        "show_category",
        "show_product",
        "business_info",
        "request_agent",
        "start_order",
      ],
      message_direction: ["inbound", "outbound"],
      message_type: [
        "text",
        "interactive",
        "image",
        "document",
        "location",
        "template",
        "status",
        "other",
      ],
      order_status: [
        "awaiting_payment",
        "pending",
        "approved",
        "on_the_way",
        "delivered",
        "cancelled",
      ],
      payment_method_type: [
        "bank_transfer",
        "pago_movil",
        "zelle",
        "usdt",
        "cash",
        "other",
      ],
      payment_status: ["pending", "paid", "failed", "refunded"],
      platform_role: ["developer", "platform_admin"],
      proof_status: ["submitted", "accepted", "rejected"],
      sender_type: ["customer", "bot", "operator", "system"],
      session_mode: ["bot", "human"],
      session_state: [
        "idle",
        "browsing_menu",
        "browsing_catalog",
        "building_cart",
        "awaiting_cart_confirmation",
        "awaiting_address",
        "awaiting_location",
        "awaiting_notes",
        "awaiting_payment_method",
        "awaiting_proof",
        "awaiting_review",
        "human_handoff",
        "closed",
      ],
      subscription_status: [
        "incomplete",
        "incomplete_expired",
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "paused",
      ],
      tenant_role: ["owner", "operator"],
      tenant_status: ["active", "suspended"],
      webhook_status: ["received", "processed", "failed"],
      whatsapp_status: ["pending", "connected", "error"],
    },
  },
} as const
