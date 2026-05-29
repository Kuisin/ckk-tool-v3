# Features

## Side Systems

Applications deployed alongside the main system.

### Login Portal (Custom or OSS)

Path for users to log in to internal applications.

### Sync Automation (Custom)

Syncs employee data from Samba AD to PostgreSQL.

### Project JSON Management Scripts

Simple scripts to manage JSON data on a local device. Edits project JSON files via a browser table view for the following files.

#### Translation JSON (`messages/`)

- Merge multiple locale JSON files into a single table view where each locale is a column and keys are flattened (dot notation).
- Allow inline editing, searching, filtering by prefix (e.g. `common`, `nav`), and detecting missing translations.
- Save edited data back into individual locale JSON files while preserving the original nested structure.

#### Permission Default JSON (`db_template/permission`)

- Provide a table editor to manage permission records including code, category, and localized fields.
- Support create, update, delete operations with filtering by category and search by code or name.
- Save updates back to `permissions.json` in a clean, structured format suitable for DB seeding.

#### Role Permission Default JSON (`db_template/role_permission`)

- Provide a role-based editor with tabs to manage roles and their metadata (name, display_name, description, system flag).
- Display a permission × action matrix where each cell maps to a scope via dropdown selection.
- Support bulk operations (grant/revoke), role CRUD, and save mappings back to JSON for seeding.
