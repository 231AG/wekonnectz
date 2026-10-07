
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "app_settings": {
                  Row: {
                    "created_at": string,"description": string,"key": string,"updated_at": string,"updated_by": string | null,"value": Json | null
                  }
                  Insert: {
                    "created_at"?: string,"description": string,"key": string,"updated_at"?: string,"updated_by"?: string | null,"value"?: Json | null
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: Json | null
                  }
                  Relationships: [
                    
                  ]
                },"areas": {
                  Row: {
                    "active": boolean,"county": string,"created_at": string,"id": string,"name": string,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"county": string,"created_at"?: string,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"county"?: string,"created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"audit_logs": {
                  Row: {
                    "action": Database["public"]['Enums']["audit_action"],"actor_id": string,"created_at": string,"entity_id": string | null,"entity_type": string,"id": string,"metadata": NonNullable<Json>
                  }
                  Insert: {
                    "action": Database["public"]['Enums']["audit_action"],"actor_id": string,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: string,"metadata"?: NonNullable<Json>
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["audit_action"],"actor_id"?: string,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"auth_hook_receipts": {
                  Row: {
                    "message_id": string,"received_at": string
                  }
                  Insert: {
                    "message_id": string,"received_at"?: string
                  }
                  Update: {
                    "message_id"?: string,"received_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"consents": {
                  Row: {
                    "accepted_at": string,"created_at": string,"document": Database["public"]['Enums']["consent_document"],"id": string,"user_id": string,"version": string
                  }
                  Insert: {
                    "accepted_at"?: string,"created_at"?: string,"document": Database["public"]['Enums']["consent_document"],"id"?: string,"user_id": string,"version": string
                  }
                  Update: {
                    "accepted_at"?: string,"created_at"?: string,"document"?: Database["public"]['Enums']["consent_document"],"id"?: string,"user_id"?: string,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "consents_document_version_fk"
      columns: ["document","version"]
isOneToOne: false
      referencedRelation: "legal_documents"
      referencedColumns: ["document","version"]
    },{
      foreignKeyName: "consents_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"geo_checks": {
                  Row: {
                    "created_at": string,"id": string,"ip_country": string | null,"phone_country": string | null,"phone_hash": string | null,"result": Database["public"]['Enums']["geo_result"]
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"ip_country"?: string | null,"phone_country"?: string | null,"phone_hash"?: string | null,"result": Database["public"]['Enums']["geo_result"]
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"ip_country"?: string | null,"phone_country"?: string | null,"phone_hash"?: string | null,"result"?: Database["public"]['Enums']["geo_result"]
                  }
                  Relationships: [
                    
                  ]
                },"geo_passes": {
                  Row: {
                    "created_at": string,"expires_at": string,"phone_hash": string,"used_at": string | null
                  }
                  Insert: {
                    "created_at"?: string,"expires_at": string,"phone_hash": string,"used_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"phone_hash"?: string,"used_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"interests": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"name": string,"slug": string,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name": string,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name"?: string,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"legal_documents": {
                  Row: {
                    "body": string,"content_sha256": string | null,"created_at": string,"document": Database["public"]['Enums']["consent_document"],"is_current": boolean,"published_at": string,"title": string,"version": string
                  }
                  Insert: {
                    "body": string,"content_sha256"?: never,"created_at"?: string,"document": Database["public"]['Enums']["consent_document"],"is_current"?: boolean,"published_at"?: string,"title": string,"version": string
                  }
                  Update: {
                    "body"?: string,"content_sha256"?: never,"created_at"?: string,"document"?: Database["public"]['Enums']["consent_document"],"is_current"?: boolean,"published_at"?: string,"title"?: string,"version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "created_at": string,"id": string,"payload": NonNullable<Json>,"read_at": string | null,"type": Database["public"]['Enums']["notification_type"],"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"type": Database["public"]['Enums']["notification_type"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"type"?: Database["public"]['Enums']["notification_type"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"phone_blocklist": {
                  Row: {
                    "created_at": string,"created_by": string | null,"phone_hash": string,"reason": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"phone_hash": string,"reason": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"phone_hash"?: string,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "phone_blocklist_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_photos": {
                  Row: {
                    "created_at": string,"id": string,"is_primary": boolean,"processing_started_at": string | null,"rejection_reason": Database["public"]['Enums']["photo_rejection_reason"] | null,"reviewed_as_primary": boolean,"reviewed_at": string | null,"reviewed_by": string | null,"sort_order": number,"status": Database["public"]['Enums']["photo_status"],"storage_path": string | null,"submitted_at": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_primary"?: boolean,"processing_started_at"?: string | null,"rejection_reason"?: Database["public"]['Enums']["photo_rejection_reason"] | null,"reviewed_as_primary"?: boolean,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sort_order"?: number,"status"?: Database["public"]['Enums']["photo_status"],"storage_path"?: string | null,"submitted_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_primary"?: boolean,"processing_started_at"?: string | null,"rejection_reason"?: Database["public"]['Enums']["photo_rejection_reason"] | null,"reviewed_as_primary"?: boolean,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sort_order"?: number,"status"?: Database["public"]['Enums']["photo_status"],"storage_path"?: string | null,"submitted_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_photos_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_photos_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "area_id": string | null,"bio": string | null,"created_at": string,"date_of_birth": string,"display_name": string | null,"dob_locked": boolean,"gender": Database["public"]['Enums']["gender"] | null,"intent_casual": boolean,"intent_relationship": boolean,"is_profile_complete": boolean,"seeking_genders": (Database["public"]['Enums']["gender"])[] | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "area_id"?: string | null,"bio"?: string | null,"created_at"?: string,"date_of_birth": string,"display_name"?: string | null,"dob_locked"?: boolean,"gender"?: Database["public"]['Enums']["gender"] | null,"intent_casual"?: boolean,"intent_relationship"?: boolean,"is_profile_complete"?: boolean,"seeking_genders"?: (Database["public"]['Enums']["gender"])[] | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "area_id"?: string | null,"bio"?: string | null,"created_at"?: string,"date_of_birth"?: string,"display_name"?: string | null,"dob_locked"?: boolean,"gender"?: Database["public"]['Enums']["gender"] | null,"intent_casual"?: boolean,"intent_relationship"?: boolean,"is_profile_complete"?: boolean,"seeking_genders"?: (Database["public"]['Enums']["gender"])[] | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_area_id_fkey"
      columns: ["area_id"]
isOneToOne: false
      referencedRelation: "areas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limit_counters": {
                  Row: {
                    "bucket": string,"count": number,"subject_hash": string,"window_start": string
                  }
                  Insert: {
                    "bucket": string,"count"?: number,"subject_hash": string,"window_start": string
                  }
                  Update: {
                    "bucket"?: string,"count"?: number,"subject_hash"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_interests": {
                  Row: {
                    "created_at": string,"interest_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"interest_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"interest_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_interests_interest_id_fkey"
      columns: ["interest_id"]
isOneToOne: false
      referencedRelation: "interests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_interests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"user_settings": {
                  Row: {
                    "casual_message_permission": Database["public"]['Enums']["message_permission"],"created_at": string,"notification_prefs": NonNullable<Json>,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "casual_message_permission"?: Database["public"]['Enums']["message_permission"],"created_at"?: string,"notification_prefs"?: NonNullable<Json>,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "casual_message_permission"?: Database["public"]['Enums']["message_permission"],"created_at"?: string,"notification_prefs"?: NonNullable<Json>,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_settings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"users": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"id": string,"last_seen_at": string | null,"role": Database["public"]['Enums']["user_role"],"status": Database["public"]['Enums']["account_status"],"suspended_until": string | null,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"id": string,"last_seen_at"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"status"?: Database["public"]['Enums']["account_status"],"suspended_until"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"last_seen_at"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"status"?: Database["public"]['Enums']["account_status"],"suspended_until"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"verifications": {
                  Row: {
                    "created_at": string,"escalated": boolean,"id": string,"pose_prompt": string,"processing_started_at": string | null,"rejection_reason": Database["public"]['Enums']["verification_rejection_reason"] | null,"reviewed_at": string | null,"reviewed_by": string | null,"selfie_deleted_at": string | null,"selfie_storage_path": string | null,"status": Database["public"]['Enums']["verification_status"],"submitted_at": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"escalated"?: boolean,"id"?: string,"pose_prompt": string,"processing_started_at"?: string | null,"rejection_reason"?: Database["public"]['Enums']["verification_rejection_reason"] | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"selfie_deleted_at"?: string | null,"selfie_storage_path"?: string | null,"status"?: Database["public"]['Enums']["verification_status"],"submitted_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"escalated"?: boolean,"id"?: string,"pose_prompt"?: string,"processing_started_at"?: string | null,"rejection_reason"?: Database["public"]['Enums']["verification_rejection_reason"] | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"selfie_deleted_at"?: string | null,"selfie_storage_path"?: string | null,"status"?: Database["public"]['Enums']["verification_status"],"submitted_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "verifications_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "verifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "abort_photo_upload":
{ Args: { "p_photo_id": string,"p_user_id": string }; Returns: undefined
                           },
"accept_current_documents":
{ Args: { "p_user_id": string,"p_versions": Json }; Returns: undefined
                           },
"age_in_years":
{ Args: { "p_dob": string,"p_on"?: string }; Returns: number
                           },
"assert_can_edit_profile":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"assert_can_verify":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"assert_member_can_manage_photos":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"audit":
{ Args: { "p_action": Database["public"]['Enums']["audit_action"],"p_entity_id": string,"p_entity_type": string,"p_metadata"?: Json }; Returns: string
                           },
"begin_photo_upload":
{ Args: { "p_user_id": string }; Returns: string
                           },
"begin_signup":
{ Args: { "p_ip": string,"p_ip_country": string,"p_phone": string }; Returns: Database["public"]['Enums']["geo_result"]
                           },
"bootstrap_super_admin":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"can_view_profile":
{ Args: { "p_owner": string,"p_viewer": string }; Returns: boolean
                           },
"claim_hook_receipt":
{ Args: { "p_message_id": string }; Returns: boolean
                           },
"claim_photo_upload":
{ Args: { "p_photo_id": string,"p_user_id": string }; Returns: boolean
                           },
"claim_verification_selfie":
{ Args: { "p_user_id": string,"p_verification_id": string }; Returns: boolean
                           },
"complete_photo_upload":
{ Args: { "p_photo_id": string,"p_storage_path": string,"p_user_id": string }; Returns: undefined
                           },
"current_staff_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["user_role"]
                           },
"current_user_can_act":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"current_user_status":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["account_status"]
                           },
"delete_photo":
{ Args: { "p_photo_id": string,"p_user_id": string }; Returns: string
                           },
"effective_account_status":
{ Args: { "p_status": Database["public"]['Enums']["account_status"],"p_suspended_until": string }; Returns: Database["public"]['Enums']["account_status"]
                           },
"get_setting":
{ Args: { "p_key": string }; Returns: Json
                           },
"has_accepted_current_documents":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"hmac_with_pepper":
{ Args: { "p_value": string }; Returns: string
                           },
"hook_before_user_created":
{ Args: { "event": Json }; Returns: Json
                           },
"hook_password_verification_attempt":
{ Args: { "event": Json }; Returns: Json
                           },
"is_liberian_phone":
{ Args: { "p_phone": string }; Returns: boolean
                           },
"is_staff":
{ Args: { "p_min_role"?: Database["public"]['Enums']["user_role"] }; Returns: boolean
                           },
"latest_verification_status":
{ Args: { "p_user_id": string }; Returns: string
                           },
"log_selfie_view":
{ Args: { "p_verification_id": string }; Returns: undefined
                           },
"mark_notifications_read":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"mark_selfies_deleted":
{ Args: { "p_verification_ids": (string)[] }; Returns: number
                           },
"member_photos":
{ Args: { "p_user_id": string }; Returns: {
              "id": string,"is_primary": boolean,"rejection_reason": Database["public"]['Enums']["photo_rejection_reason"],"sort_order": number,"status": Database["public"]['Enums']["photo_status"],"storage_path": string
            }[]
                           },
"member_review_status":
{ Args: { "p_user_id": string }; Returns: Json
                           },
"normalize_phone":
{ Args: { "p_phone": string }; Returns: string
                           },
"notify":
{ Args: { "p_payload"?: Json,"p_type": Database["public"]['Enums']["notification_type"],"p_user_id": string }; Returns: undefined
                           },
"onboarding_progress":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"onboarding_progress_for":
{ Args: { "p_user_id": string }; Returns: Json
                           },
"otp_ip_allowed":
{ Args: { "p_ip": string }; Returns: boolean
                           },
"otp_send_allowed":
{ Args: { "p_phone": string }; Returns: boolean
                           },
"phone_hash":
{ Args: { "p_phone": string }; Returns: string
                           },
"photos_for_viewer":
{ Args: { "p_owner": string,"p_viewer": string }; Returns: {
              "id": string,"is_primary": boolean,"sort_order": number,"status": Database["public"]['Enums']["photo_status"],"storage_path": string
            }[]
                           },
"rate_limit_count":
{ Args: { "p_bucket": string,"p_subject": string,"p_window_seconds": number }; Returns: number
                           },
"rate_limit_hit":
{ Args: { "p_bucket": string,"p_max": number,"p_subject": string,"p_window_seconds": number }; Returns: boolean
                           },
"recompute_account_state":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"record_staff_sign_in_failure":
{ Args: { "p_account": string,"p_ip": string }; Returns: undefined
                           },
"release_hook_receipt":
{ Args: { "p_message_id": string }; Returns: undefined
                           },
"release_verification_selfie":
{ Args: { "p_user_id": string,"p_verification_id": string }; Returns: undefined
                           },
"renumber_photos":
{ Args: { "p_user_id": string }; Returns: string
                           },
"review_photo":
{ Args: { "p_approve": boolean,"p_photo_id": string,"p_reason"?: Database["public"]['Enums']["photo_rejection_reason"] }; Returns: undefined
                           },
"review_photo_paths":
{ Args: { "p_photo_ids": (string)[] }; Returns: {
              "id": string,"storage_path": string
            }[]
                           },
"review_verification":
{ Args: { "p_approve": boolean,"p_reason"?: Database["public"]['Enums']["verification_rejection_reason"],"p_verification_id": string }; Returns: undefined
                           },
"save_interests_and_bio":
{ Args: { "p_bio": string,"p_interest_ids": (string)[],"p_user_id": string }; Returns: undefined
                           },
"save_profile_basics":
{ Args: { "p_area_id": string,"p_display_name": string,"p_gender": Database["public"]['Enums']["gender"],"p_intent_casual": boolean,"p_intent_relationship": boolean,"p_seeking_genders": (Database["public"]['Enums']["gender"])[],"p_user_id": string }; Returns: undefined
                           },
"selfies_due_for_deletion":
{ Args: { "p_limit"?: number }; Returns: {
              "storage_path": string,"verification_id": string
            }[]
                           },
"set_date_of_birth":
{ Args: { "p_dob": string }; Returns: undefined
                           },
"set_primary_photo":
{ Args: { "p_photo_id": string,"p_user_id": string }; Returns: undefined
                           },
"staff_photo_queue":
{ Args: { "p_limit"?: number }; Returns: {
              "age": number,"approved_count": number,"display_name": string,"is_primary": boolean,"photo_id": string,"sort_order": number,"uploaded_at": string,"user_id": string
            }[]
                           },
"staff_queue_counts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"staff_sign_in_allowed":
{ Args: { "p_account": string,"p_ip": string }; Returns: boolean
                           },
"staff_verification_detail":
{ Args: { "p_verification_id": string }; Returns: Json
                           },
"staff_verification_queue":
{ Args: { "p_limit"?: number }; Returns: {
              "age": number,"display_name": string,"escalated": boolean,"previous_rejections": number,"submitted_at": string,"user_id": string,"verification_id": string
            }[]
                           },
"start_verification":
{ Args: { "p_user_id": string }; Returns: {
              "pose_prompt": string,"verification_id": string
            }[]
                           },
"submit_verification":
{ Args: { "p_storage_path": string,"p_user_id": string,"p_verification_id": string }; Returns: undefined
                           },
"verification_review_paths":
{ Args: { "p_verification_id": string }; Returns: {
              "id": string,"is_primary": boolean,"kind": string,"sort_order": number,"status": Database["public"]['Enums']["photo_status"],"storage_path": string
            }[]
                           }
          }
          Enums: {
            "account_status": "PENDING"|"ACTIVE"|"SUSPENDED"|"BANNED"|"DELETED","audit_action": "USER_SUSPENDED"|"USER_BANNED"|"USER_RESTORED"|"VERIFICATION_APPROVED"|"VERIFICATION_REJECTED"|"SELFIE_VIEWED"|"PHOTO_APPROVED"|"PHOTO_REJECTED"|"DOB_CORRECTED"|"SUBSCRIPTION_MODIFIED"|"PAYMENT_REFUNDED"|"PAYMENT_CLAIM_APPROVED"|"PAYMENT_CLAIM_REJECTED"|"PAYMENT_CLAIM_NEEDS_INFO"|"EVIDENCE_VIEWED"|"REPORT_RESOLVED"|"SETTING_CHANGED"|"ROLE_CHANGED"|"ADMIN_CREATED","consent_document": "TERMS"|"PRIVACY"|"RULES","gender": "WOMAN"|"MAN","geo_result": "PASS"|"BLOCKED_COUNTRY"|"BLOCKED_PHONE"|"BLOCKED_LIST"|"RATE_LIMITED","message_permission": "ANYONE"|"NOBODY","notification_type": "VERIFICATION_APPROVED"|"VERIFICATION_REJECTED"|"PHOTO_REJECTED"|"ACCOUNT_ACTIVE","photo_rejection_reason": "FACE_NOT_CLEAR"|"NUDITY_OR_SEXUAL"|"TEXT_OR_CONTACT"|"CHILD_IN_PHOTO"|"NOT_THE_MEMBER"|"POOR_QUALITY","photo_status": "UPLOADING"|"PENDING_REVIEW"|"APPROVED"|"REJECTED"|"HIDDEN"|"DELETED","user_role": "USER"|"MODERATOR"|"ADMIN"|"SUPER_ADMIN","verification_rejection_reason": "POSE_NOT_MATCHING"|"NOT_SAME_PERSON"|"AGE_DOUBT"|"NOT_LIVE"|"UNCLEAR","verification_status": "AWAITING_SELFIE"|"PENDING"|"VERIFIED"|"REJECTED"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_status": ["PENDING", "ACTIVE", "SUSPENDED", "BANNED", "DELETED"],"audit_action": ["USER_SUSPENDED", "USER_BANNED", "USER_RESTORED", "VERIFICATION_APPROVED", "VERIFICATION_REJECTED", "SELFIE_VIEWED", "PHOTO_APPROVED", "PHOTO_REJECTED", "DOB_CORRECTED", "SUBSCRIPTION_MODIFIED", "PAYMENT_REFUNDED", "PAYMENT_CLAIM_APPROVED", "PAYMENT_CLAIM_REJECTED", "PAYMENT_CLAIM_NEEDS_INFO", "EVIDENCE_VIEWED", "REPORT_RESOLVED", "SETTING_CHANGED", "ROLE_CHANGED", "ADMIN_CREATED"],"consent_document": ["TERMS", "PRIVACY", "RULES"],"gender": ["WOMAN", "MAN"],"geo_result": ["PASS", "BLOCKED_COUNTRY", "BLOCKED_PHONE", "BLOCKED_LIST", "RATE_LIMITED"],"message_permission": ["ANYONE", "NOBODY"],"notification_type": ["VERIFICATION_APPROVED", "VERIFICATION_REJECTED", "PHOTO_REJECTED", "ACCOUNT_ACTIVE"],"photo_rejection_reason": ["FACE_NOT_CLEAR", "NUDITY_OR_SEXUAL", "TEXT_OR_CONTACT", "CHILD_IN_PHOTO", "NOT_THE_MEMBER", "POOR_QUALITY"],"photo_status": ["UPLOADING", "PENDING_REVIEW", "APPROVED", "REJECTED", "HIDDEN", "DELETED"],"user_role": ["USER", "MODERATOR", "ADMIN", "SUPER_ADMIN"],"verification_rejection_reason": ["POSE_NOT_MATCHING", "NOT_SAME_PERSON", "AGE_DOUBT", "NOT_LIVE", "UNCLEAR"],"verification_status": ["AWAITING_SELFIE", "PENDING", "VERIFIED", "REJECTED"]
          }
        }
} as const
