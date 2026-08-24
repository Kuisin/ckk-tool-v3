-- Baseline 4/6 — system tables (auth / sys / kiosk / notification / directory).

-- app.audit_logs (TABLE)
CREATE TABLE app.audit_logs (
    id bigint NOT NULL,
    user_id uuid,
    action text NOT NULL,
    table_name text NOT NULL,
    record_id text,
    before_data jsonb,
    after_data jsonb,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    kiosk_device_id uuid
);

-- app.audit_logs_id_seq (SEQUENCE)
CREATE SEQUENCE app.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.audit_logs_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.audit_logs_id_seq OWNED BY app.audit_logs.id;

-- app.document_attachments (TABLE)
CREATE TABLE app.document_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_type text NOT NULL,
    owner_id text NOT NULL,
    file_id uuid NOT NULL,
    label text,
    uploaded_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_locked boolean DEFAULT false NOT NULL
);

-- app.document_memo_revisions (TABLE)
CREATE TABLE app.document_memo_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    memo_id uuid,
    owner_type text NOT NULL,
    owner_id text NOT NULL,
    kind text NOT NULL,
    action text NOT NULL,
    content jsonb NOT NULL,
    plain_text text NOT NULL,
    edited_by uuid,
    edited_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.document_memos (TABLE)
CREATE TABLE app.document_memos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_type text NOT NULL,
    owner_id text NOT NULL,
    kind text NOT NULL,
    content jsonb NOT NULL,
    plain_text text NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    archived_at timestamp(6) with time zone,
    archived_by uuid
);

-- app.feature_flags (TABLE)
CREATE TABLE app.feature_flags (
    key text NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    description text,
    updated_by uuid,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.file_folder_grants (TABLE)
CREATE TABLE app.file_folder_grants (
    id integer NOT NULL,
    path_prefix text NOT NULL,
    user_id uuid NOT NULL,
    can_write boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.file_folder_grants_id_seq (SEQUENCE)
CREATE SEQUENCE app.file_folder_grants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.file_folder_grants_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.file_folder_grants_id_seq OWNED BY app.file_folder_grants.id;

-- app.files (TABLE)
CREATE TABLE app.files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    storage_key text NOT NULL,
    filename text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint,
    uploaded_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.kiosk_cards (TABLE)
CREATE TABLE app.kiosk_cards (
    id text NOT NULL,
    user_id uuid,
    status app."KIOSK_CARD_STATUS" DEFAULT 'UNASSIGNED'::app."KIOSK_CARD_STATUS" NOT NULL,
    pin_hash text,
    pin_set_at timestamp(6) with time zone,
    pin_failed_attempts integer DEFAULT 0 NOT NULL,
    pin_locked_until timestamp(6) with time zone,
    pin_last_verified_at timestamp(6) with time zone,
    last_used_at timestamp(6) with time zone,
    use_count integer DEFAULT 0 NOT NULL,
    assigned_at timestamp(6) with time zone,
    assigned_by uuid,
    revoked_at timestamp(6) with time zone,
    revoked_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    valid_from timestamp(6) with time zone,
    valid_until timestamp(6) with time zone,
    max_active_sessions integer DEFAULT 1 NOT NULL
);

-- app.kiosk_device_locations (TABLE)
CREATE TABLE app.kiosk_device_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_id uuid NOT NULL,
    latitude numeric(9,6) NOT NULL,
    longitude numeric(9,6) NOT NULL,
    accuracy_m numeric(8,1),
    recorded_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.kiosk_device_logs (TABLE)
CREATE TABLE app.kiosk_device_logs (
    id bigint NOT NULL,
    device_id uuid NOT NULL,
    type app."KIOSK_DEVICE_LOG_TYPE" NOT NULL,
    user_id uuid,
    source text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.kiosk_device_logs_id_seq (SEQUENCE)
CREATE SEQUENCE app.kiosk_device_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.kiosk_device_logs_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.kiosk_device_logs_id_seq OWNED BY app.kiosk_device_logs.id;

-- app.kiosk_devices (TABLE)
CREATE TABLE app.kiosk_devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name jsonb,
    location text,
    plant_id integer,
    floor_map_id uuid,
    map_x numeric(5,2),
    map_y numeric(5,2),
    status app."KIOSK_DEVICE_STATUS" DEFAULT 'PENDING'::app."KIOSK_DEVICE_STATUS" NOT NULL,
    device_token_hash text,
    device_token_expires_at timestamp(6) with time zone,
    user_agent text,
    last_ip_address text,
    activated_by uuid,
    activated_at timestamp(6) with time zone,
    last_activity_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    device_public_key text,
    fingerprint text,
    linked_at timestamp(6) with time zone,
    settings_code text DEFAULT lpad((floor((random() * (1000000)::double precision)))::text, 6, '0'::text) NOT NULL,
    default_work_location_id integer,
    enforce_work_location boolean DEFAULT false NOT NULL
);

-- app.kiosk_floor_maps (TABLE)
CREATE TABLE app.kiosk_floor_maps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plant_id integer NOT NULL,
    name text NOT NULL,
    file_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.kiosk_link_requests (TABLE)
CREATE TABLE app.kiosk_link_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    device_id uuid,
    user_agent text,
    last_ip_address text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp(6) with time zone NOT NULL
);

-- app.kiosk_sessions (TABLE)
CREATE TABLE app.kiosk_sessions (
    id text NOT NULL,
    user_id uuid NOT NULL,
    card_id text NOT NULL,
    device_id uuid NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp(6) with time zone NOT NULL,
    last_activity_at timestamp(6) with time zone NOT NULL,
    revoked_at timestamp(6) with time zone
);

-- app.link_blacklist (TABLE)
CREATE TABLE app.link_blacklist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pattern text NOT NULL,
    reason text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.link_index (TABLE)
CREATE TABLE app.link_index (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    url text NOT NULL,
    hostname text NOT NULL,
    hit_count integer DEFAULT 0 NOT NULL,
    last_used_at timestamp(6) with time zone,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.notifications (TABLE)
CREATE TABLE app.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text,
    link_path text,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.numbering_sequences (TABLE)
CREATE TABLE app.numbering_sequences (
    key text NOT NULL,
    prefix text NOT NULL,
    last_year_month text,
    last_sequence integer DEFAULT 0 NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.permissions (TABLE)
CREATE TABLE app.permissions (
    code text NOT NULL,
    display_name jsonb NOT NULL,
    description jsonb
);

-- app.push_subscriptions (TABLE)
CREATE TABLE app.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.role_permission_relation (TABLE)
CREATE TABLE app.role_permission_relation (
    role_id integer NOT NULL,
    permission_code text NOT NULL,
    action app."ACTION" NOT NULL,
    scope app."SCOPE" NOT NULL,
    scope_values text[] DEFAULT ARRAY['*'::text] NOT NULL
);

-- app.roles (TABLE)
CREATE TABLE app.roles (
    id integer NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    rolename text NOT NULL,
    display_name jsonb NOT NULL,
    description jsonb
);

-- app.roles_id_seq (SEQUENCE)
CREATE SEQUENCE app.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.roles_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.roles_id_seq OWNED BY app.roles.id;

-- app.system_settings (TABLE)
CREATE TABLE app.system_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    description text,
    updated_by uuid,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.user_home_settings (TABLE)
CREATE TABLE app.user_home_settings (
    user_id uuid NOT NULL,
    mode text DEFAULT 'default'::text NOT NULL,
    starred jsonb DEFAULT '[]'::jsonb NOT NULL,
    groups jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.user_notification_settings (TABLE)
CREATE TABLE app.user_notification_settings (
    user_id uuid NOT NULL,
    email_enabled boolean DEFAULT true NOT NULL,
    push_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.user_role_relation (TABLE)
CREATE TABLE app.user_role_relation (
    user_id uuid NOT NULL,
    role_id integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    assigned_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deactivate_at timestamp(6) with time zone,
    assigned_by uuid
);

-- app.users (TABLE)
CREATE TABLE app.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "group" app."USER_GROUP" NOT NULL,
    employee_id uuid,
    username text NOT NULL,
    display_name text NOT NULL,
    email text,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    password_hash text,
    locale text DEFAULT 'ja'::text NOT NULL,
    avatar_file_id uuid,
    avatar_thumb_file_id uuid,
    date_format character varying(16) DEFAULT 'YYYY/MM/DD'::character varying NOT NULL,
    time_format character varying(8) DEFAULT '24h'::character varying NOT NULL,
    time_zone character varying(64) DEFAULT 'Asia/Tokyo'::character varying NOT NULL,
    CONSTRAINT users_date_format_check CHECK (date_format IN ('YYYY/MM/DD', 'YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY')),
    CONSTRAINT users_locale_check CHECK ((locale = ANY (ARRAY['ja'::text, 'en'::text, 'zh'::text]))),
    CONSTRAINT users_time_format_check CHECK (time_format IN ('24h', '12h'))
);

-- app.user_plants (TABLE)
CREATE TABLE app.user_plants (
    user_id uuid NOT NULL,
    plant_id integer NOT NULL,
    assigned_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    assigned_by uuid
);

-- directory.employee_directory (TABLE)
CREATE TABLE directory.employee_directory (
    username text NOT NULL,
    display_name text,
    email text,
    department text,
    title text,
    company text,
    office text,
    manager text,
    is_active boolean,
    employee_code integer,
    member_of text[] DEFAULT '{}'::text[] NOT NULL,
    last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    ldap_guid uuid,
    given_name text,
    sn text,
    cn text,
    upn text,
    dn text,
    phone text,
    mobile text,
    fax text,
    description text,
    when_created timestamp(6) with time zone,
    when_changed timestamp(6) with time zone,
    account_expires timestamp(6) with time zone
);

-- directory.ldap_sync_log (TABLE)
CREATE TABLE directory.ldap_sync_log (
    id bigint NOT NULL,
    finished_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text,
    status text,
    total integer,
    message text
);

-- directory.ldap_sync_log_id_seq (SEQUENCE)
ALTER TABLE directory.ldap_sync_log ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME directory.ldap_sync_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- app.audit_logs id (DEFAULT)
ALTER TABLE ONLY app.audit_logs ALTER COLUMN id SET DEFAULT nextval('app.audit_logs_id_seq'::regclass);

-- app.file_folder_grants id (DEFAULT)
ALTER TABLE ONLY app.file_folder_grants ALTER COLUMN id SET DEFAULT nextval('app.file_folder_grants_id_seq'::regclass);

-- app.kiosk_device_logs id (DEFAULT)
ALTER TABLE ONLY app.kiosk_device_logs ALTER COLUMN id SET DEFAULT nextval('app.kiosk_device_logs_id_seq'::regclass);

-- app.roles id (DEFAULT)
ALTER TABLE ONLY app.roles ALTER COLUMN id SET DEFAULT nextval('app.roles_id_seq'::regclass);
