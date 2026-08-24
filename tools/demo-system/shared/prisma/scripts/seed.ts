import "dotenv/config";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { prisma } from "../index";

interface DevUser {
  credential: string;
  password: string;
  name: string;
  employeeCode?: number;
  image: string | null;
}

interface DevUsersData {
  users: DevUser[];
}

interface PermissionRow {
  category: string;
  name: string;
  action: string;
  resource: string;
  scope: string;
  accessType: string;
  isActive: string;
}

// Helper function to map action string to PermissionAction enum
function mapAction(
  action: string,
):
  | "CREATE"
  | "READ"
  | "UPDATE"
  | "DELETE"
  | "ACCESS"
  | "PRINT"
  | "REQUEST"
  | "APPROVE"
  | "ORDER"
  | "FORCE"
  | "LOCK"
  | "COMPLETE"
  | "CANCEL"
  | "CUT" {
  const actionMap: Record<
    string,
    | "CREATE"
    | "READ"
    | "UPDATE"
    | "DELETE"
    | "ACCESS"
    | "PRINT"
    | "REQUEST"
    | "APPROVE"
    | "ORDER"
    | "FORCE"
    | "LOCK"
    | "COMPLETE"
    | "CANCEL"
    | "CUT"
  > = {
    create: "CREATE",
    read: "READ",
    update: "UPDATE",
    delete: "DELETE",
    access: "ACCESS",
    print: "PRINT",
    request: "REQUEST",
    approve: "APPROVE",
    order: "ORDER",
    force: "FORCE",
    lock: "LOCK",
    complete: "COMPLETE",
    cancel: "CANCEL",
    cut: "CUT",
  };
  return actionMap[action.toLowerCase()] || "READ";
}

// Helper function to map scope string to PermissionScope enum
function mapScope(
  scope: string,
):
  | "ALL"
  | "OWN"
  | "TEAM"
  | "DEPARTMENT"
  | "GROUP"
  | "ZONE"
  | "NONE"
  | "CUSTOM" {
  const scopeMap: Record<
    string,
    "ALL" | "OWN" | "TEAM" | "DEPARTMENT" | "GROUP" | "ZONE" | "NONE" | "CUSTOM"
  > = {
    all: "ALL",
    own: "OWN",
    team: "TEAM",
    department: "DEPARTMENT",
    group: "GROUP",
    zone: "ZONE",
    none: "NONE",
    custom: "CUSTOM",
  };
  return scopeMap[scope.toLowerCase()] || "ALL";
}

// Helper function to map accessType string to AccessType enum
function mapAccessType(accessType: string): "KIOSK" | "WEB" | "BOTH" {
  const accessTypeMap: Record<string, "KIOSK" | "WEB" | "BOTH"> = {
    web: "WEB",
    kiosk: "KIOSK",
    both: "BOTH",
  };
  return accessTypeMap[accessType.toUpperCase()] || "BOTH";
}

// Helper function to generate permission code
function generatePermissionCode(
  action: string,
  resource: string,
  scope: string,
): string {
  return `${action.toLowerCase()}:${resource.toLowerCase()}#${scope.toLowerCase()}`;
}

// Simple CSV parser
function parseCSV(content: string): PermissionRow[] {
  const lines = content.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split("\t").map((h) => h.trim());
  const records: PermissionRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = line.split("\t");
    if (values.length < headers.length) {
      console.warn(`⚠️  Skipping line ${i + 1}: insufficient columns`);
      continue;
    }

    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index]?.trim() || "";
    });
    records.push(record as unknown as PermissionRow);
  }

  return records;
}

async function seedPermissions() {
  console.log("📋 Seeding permissions from CSV...");

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // Use permissions.csv from data directory (shared/prisma/data/permissions.csv)
  const csvPath = join(__dirname, "../data/permissions.csv");
  const csvContent = readFileSync(csvPath, "utf-8");

  const records = parseCSV(csvContent);

  const permissions = [];

  for (const row of records) {
    // Skip rows with missing required fields
    if (!row.action || !row.resource) {
      console.warn(`⚠️  Skipping row: missing action or resource`);
      continue;
    }

    const action = mapAction(row.action);
    const scope = mapScope(row.scope);
    const accessType = mapAccessType(row.accessType);
    const code = generatePermissionCode(action, row.resource, scope);

    try {
      // Parse JSON fields with error handling
      let category = null;
      if (row.category?.trim()) {
        try {
          category = JSON.parse(row.category);
        } catch {
          console.warn(
            `⚠️  Failed to parse category JSON for ${code}: ${row.category}`,
          );
        }
      }

      let name = { ja: "" };
      if (row.name?.trim()) {
        try {
          name = JSON.parse(row.name);
        } catch {
          console.warn(`⚠️  Failed to parse name JSON for ${code}: ${row.name}`);
          name = { ja: row.name }; // Fallback to raw value
        }
      }

      const permissionData = {
        code,
        category: category,
        name: name,
        action: action as never,
        resource: row.resource,
        scope: scope as never,
        accessType: accessType as never,
        isActive: row.isActive === "TRUE",
      };

      const permission = await prisma.permission.upsert({
        where: { code },
        update: permissionData,
        create: permissionData,
      });

      permissions.push(permission);
      console.log(`  ✅ Permission: ${code}`);
    } catch (error) {
      console.error(`  ❌ Failed to seed permission ${code}:`, error);
      if (error instanceof Error) {
        console.error(`     Error message: ${error.message}`);
      }
    }
  }

  console.log(`✨ Seeded ${permissions.length} permissions`);
  return permissions;
}

async function seedGroups() {
  console.log("👥 Seeding groups...");

  const groups = [
    {
      name: "app_admins",
      displayName: "Administrators",
      description: "Full system administrators with all permissions",
      source: "APP" as const,
    },
    {
      name: "app_managers",
      displayName: "Managers",
      description: "Managers with team-level permissions",
      source: "APP" as const,
    },
    {
      name: "app_users",
      displayName: "Regular Users",
      description: "Regular users with own-level permissions",
      source: "APP" as const,
    },
    {
      name: "app_qr_operators",
      displayName: "QR Operators",
      description: "Users who can manage QR codes",
      source: "APP" as const,
    },
    {
      name: "app_order_managers",
      displayName: "Order Managers",
      description: "Users who can manage orders",
      source: "APP" as const,
    },
  ];

  const createdGroups = [];

  for (const groupData of groups) {
    try {
      const group = await prisma.group.upsert({
        where: { name: groupData.name },
        update: {
          displayName: groupData.displayName,
          description: groupData.description,
        },
        create: groupData,
      });

      createdGroups.push(group);
      console.log(`  ✅ Group: ${group.name}`);
    } catch (error) {
      console.error(`  ❌ Failed to seed group ${groupData.name}:`, error);
    }
  }

  console.log(`✨ Seeded ${createdGroups.length} groups`);
  return createdGroups;
}

async function seedGroupPermissions(
  groups: Array<{ id: number; name: string }>,
  permissions: Array<{ id: number; code: string }>,
) {
  console.log("🔗 Seeding group permissions...");

  // Helper function to extract scope from permission code
  const getScopeFromCode = (code: string): string | null => {
    const parts = code.split("#");
    return parts.length === 2 ? parts[1].toUpperCase() : null;
  };

  // Helper function to extract action and resource from permission code
  const getActionResourceFromCode = (code: string): string | null => {
    const parts = code.split("#");
    return parts.length === 2 ? parts[0].toLowerCase() : null;
  };

  // Map permissions to groups based on their scope and resource
  // These permissions must match what's defined in permissions.csv
  const groupPermissionMap: Record<string, string[]> = {
    app_admins: ["*"], // All permissions with ALL scope only
    app_managers: [
      // Order permissions (team level)
      "update:order#team",
      "approve:order#team",
      "read:order#team",
      "create:order.receipt#team",
      "read:order.receipt#team",
      "update:order.receipt#team",
      "delete:order.receipt#team",
      // Item permissions (team level)
      "create:item#team",
      "read:item#team",
      "update:item#team",
      "delete:item#team",
      // Machine permissions (team level)
      "create:machine#team",
      "read:machine#team",
      "update:machine#team",
      "delete:machine#team",
      // Material permissions (team level)
      "create:material#team",
      "read:material#team",
      "update:material#team",
      "delete:material#team",
      // Stock permissions (team level)
      "create:supplier#team",
      "read:supplier#team",
      "update:supplier#team",
      "create:stock.purchase#team",
      "read:stock.purchase#team",
      "update:stock.purchase#team",
      "request:stock.purchase#team",
      "approve:stock.purchase#team",
      "order:stock.purchase#team",
      "complete:stock.purchase#team",
      "read:stock#team",
      "create:stock.reservation#team",
      "read:stock.reservation#team",
      "update:stock.reservation#team",
      "create:stock.transaction#team",
      "read:stock.transaction#team",
      // Order process permissions (team level)
      "read:order.process#team",
      "update:order.process#team",
      "create:order.process#team",
      "force:order.process#team",
      // Order process log permissions (team level)
      "read:order.processlog#team",
      "create:order.processlog#team",
      "force:order.processlog#team",
      // QR revoke permissions (team level)
      "approve:qr.revoke#team",
      // Invoice (team level)
      "read:invoice#team",
      "create:invoice#team",
      "update:invoice#team",
      "delete:invoice#team",
      // Address (all level)
      "read:address#all",
      "create:address#all",
      "update:address#all",
      "delete:address#all",
    ],
    app_users: [
      // Company, customer, factory (view only)
      "read:company#all",
      "read:customer#all",
      "read:factory#all",
      // Invoice (own level)
      "read:invoice#own",
      "create:invoice#own",
      "update:invoice#own",
      "delete:invoice#own",
      // Address (all level)
      "read:address#all",
      "create:address#all",
      "update:address#all",
      "delete:address#all",
      // Order permissions (own level)
      "create:order#own",
      "update:order#own",
      "read:order#own",
      "create:order.receipt#own",
      "read:order.receipt#own",
      "update:order.receipt#own",
      "delete:order.receipt#own",
      // Item permissions (own level)
      "create:item#own",
      "update:item#own",
      "read:item#own",
      "delete:item#own",
      // Machine permissions (own level)
      "create:machine#own",
      "read:machine#own",
      "update:machine#own",
      "delete:machine#own",
      // Material permissions (own level)
      "create:material#own",
      "read:material#own",
      "update:material#own",
      "delete:material#own",
      // Stock permissions (own level)
      "read:supplier#own",
      "create:stock.purchase#own",
      "read:stock.purchase#own",
      "update:stock.purchase#own",
      "request:stock.purchase#own",
      "order:stock.purchase#own",
      "complete:stock.purchase#own",
      "read:stock#own",
      "read:stock.reservation#own",
      "read:stock.transaction#own",
      // Order process permissions (own level)
      "read:order.process#own",
      "update:order.process#own",
      // Order process log permissions (own level)
      "create:order.processlog#own",
      "read:order.processlog#own",
      "force:order.processlog#own",
      // QR permissions (own level)
      "access:qr#own",
      "request:qr.revoke#own",
    ],
    app_qr_operators: [
      // QR code permissions (all level)
      "create:qr#all",
      "update:qr#all",
      "read:qr#all",
      "print:qr#all",
      // QR revoke permissions
      "approve:qr.revoke#team",
      "approve:qr.revoke#all",
      "create:qr.revoke#own",
      "create:qr.revoke#team",
      "create:qr.revoke#all",
      // Address (read for all employees)
      "read:address#all",
    ],
    app_order_managers: [
      // Order permissions (all level)
      "update:order#all",
      "approve:order#all",
      "read:order#all",
      "create:order.receipt#all",
      "read:order.receipt#all",
      "update:order.receipt#all",
      "delete:order.receipt#all",
      // Item permissions (all level)
      "create:item#all",
      "read:item#all",
      "update:item#all",
      "force:item#all",
      "delete:item#all",
      // Machine permissions (all level)
      "create:machine#all",
      "read:machine#all",
      "update:machine#all",
      "delete:machine#all",
      // Material permissions (all level)
      "create:material#all",
      "read:material#all",
      "update:material#all",
      "delete:material#all",
      // Stock permissions (all level)
      "create:supplier#all",
      "read:supplier#all",
      "update:supplier#all",
      "delete:supplier#all",
      "create:stock.purchase#all",
      "read:stock.purchase#all",
      "update:stock.purchase#all",
      "request:stock.purchase#all",
      "approve:stock.purchase#all",
      "order:stock.purchase#all",
      "complete:stock.purchase#all",
      "read:stock#all",
      "create:stock.reservation#all",
      "read:stock.reservation#all",
      "update:stock.reservation#all",
      "lock:stock.reservation#all",
      "complete:stock.reservation#all",
      "cancel:stock.reservation#all",
      "create:stock.transaction#all",
      "read:stock.transaction#all",
      "cut:stock.transaction#all",
      // Order process permissions (all level)
      "create:order.process#all",
      "read:order.process#all",
      "update:order.process#all",
      "force:order.process#all",
      // Order process log permissions (all level)
      "create:order.processlog#all",
      "read:order.processlog#all",
      "force:order.processlog#all",
      // Invoice (all level)
      "read:invoice#all",
      "create:invoice#all",
      "update:invoice#all",
      "delete:invoice#all",
      // Address (all level)
      "read:address#all",
      "create:address#all",
      "update:address#all",
      "delete:address#all",
    ],
  };

  let count = 0;
  let skipped = 0;

  for (const group of groups) {
    const permissionCodes = groupPermissionMap[group.name] || [];

    console.log(`  📋 Processing group: ${group.name}`);

    // Track action+resource+scope combinations to prevent duplicates
    const addedPermissions = new Set<string>();

    for (const code of permissionCodes) {
      const permission =
        code === "*" ? null : permissions.find((p) => p.code === code);

      if (code === "*") {
        // Grant only ALL scope permissions to admins, and prevent duplicates for same action+resource+scope
        console.log(`    🔓 Granting ALL scope permissions to ${group.name}`);

        for (const perm of permissions) {
          const scope = getScopeFromCode(perm.code);
          const actionResource = getActionResourceFromCode(perm.code);

          // Only grant permissions with ALL scope
          if (scope !== "ALL") {
            continue;
          }

          // Create a unique key for action+resource+scope combination
          const permissionKey =
            actionResource && scope ? `${actionResource}#${scope}` : perm.code;

          // Skip if we've already added a permission for this action+resource+scope combination
          if (addedPermissions.has(permissionKey)) {
            continue;
          }

          try {
            await prisma.groupPermission.upsert({
              where: {
                groupId_permissionId: {
                  groupId: group.id,
                  permissionId: perm.id,
                },
              },
              update: {},
              create: {
                groupId: group.id,
                permissionId: perm.id,
                grantedBy: "system",
              },
            });

            addedPermissions.add(permissionKey);
            count++;
          } catch (error) {
            console.error(
              `    ❌ Failed to link permission ${perm.code} to group ${group.name}:`,
              error,
            );
          }
        }
      } else if (permission) {
        // Check if we've already added a permission for this action+resource+scope combination
        const actionResource = getActionResourceFromCode(code);
        const scope = getScopeFromCode(code);
        const permissionKey =
          actionResource && scope ? `${actionResource}#${scope}` : code;

        if (addedPermissions.has(permissionKey)) {
          console.log(`    ⚠️  Skipping duplicate: ${code}`);
          skipped++;
          continue;
        }

        try {
          await prisma.groupPermission.upsert({
            where: {
              groupId_permissionId: {
                groupId: group.id,
                permissionId: permission.id,
              },
            },
            update: {},
            create: {
              groupId: group.id,
              permissionId: permission.id,
              grantedBy: "system",
            },
          });
          addedPermissions.add(permissionKey);
          count++;
          console.log(`    ✅ Linked: ${code}`);
        } catch (error) {
          console.error(
            `    ❌ Failed to link permission ${code} to group ${group.name}:`,
            error,
          );
        }
      } else {
        skipped++;
        console.log(`    ⚠️  Permission not found: ${code}`);
      }
    }
  }

  console.log(
    `✨ Seeded ${count} group permissions${skipped > 0 ? ` (${skipped} skipped)` : ""}`,
  );
}

async function seedEmployeeGroups(
  employees: Array<{ username: string }>,
  groups: Array<{ id: number; name: string }>,
) {
  console.log("👤 Seeding employee group memberships...");

  const employeeGroupMap: Record<string, string[]> = {
    admin: ["app_admins"],
    test: ["app_managers", "app_users"],
    dev: ["app_order_managers", "app_users"],
    "kaisei.sawada": ["app_managers", "app_users"],
    "tomoaki.hatori": ["app_users"],
    "yasuhiro.okazawa": ["app_users"],
    "hironobu.minami": ["app_users"],
  };

  let count = 0;

  for (const employee of employees) {
    const groupNames = employeeGroupMap[employee.username] || ["app_users"];

    for (const groupName of groupNames) {
      const group = groups.find((g) => g.name === groupName);
      if (group) {
        try {
          await prisma.employeeGroupMembership.upsert({
            where: {
              employeeUsername_groupId: {
                employeeUsername: employee.username,
                groupId: group.id,
              },
            },
            update: {},
            create: {
              employeeUsername: employee.username,
              groupId: group.id,
              source: "APP",
              addedBy: "system",
            },
          });
          count++;
        } catch (error) {
          console.error(
            `  ❌ Failed to add ${employee.username} to group ${groupName}:`,
            error,
          );
        }
      }
    }
  }

  console.log(`✨ Seeded ${count} employee group memberships`);
}

async function seedAccessCards(employees: Array<{ username: string }>) {
  console.log("💳 Seeding access cards...");

  // Get list of valid employee usernames
  const validUsernames = new Set(employees.map((e) => e.username));

  const cards = [
    {
      cardId: "A1B2-C3D4-E5F6-G7H8",
      employeeUsername: "admin",
      status: "ASSIGNED" as const,
      assignedBy: "system",
    },
    {
      cardId: "I9J0-K1L2-M3N4-O5P6",
      employeeUsername: "test",
      status: "ASSIGNED" as const,
      assignedBy: "system",
    },
    {
      cardId: "Q7R8-S9T0-U1V2-W3X4",
      employeeUsername: "dev",
      status: "ASSIGNED" as const,
      assignedBy: "system",
    },
    {
      cardId: "Y5Z6-A7B8-C9D0-E1F2",
      employeeUsername: "kaisei.sawada",
      status: "ASSIGNED" as const,
      assignedBy: "system",
    },
    {
      cardId: "G3H4-I5J6-K7L8-M9N0",
      employeeUsername: "tomoaki.hatori",
      status: "ASSIGNED" as const,
      assignedBy: "system",
    },
    {
      cardId: "O1P2-Q3R4-S5T6-U7V8",
      employeeUsername: "kaisei.sawada",
      status: "ASSIGNED" as const,
      assignedBy: "system",
    },
    {
      cardId: "W9X0-Y1Z2-A3B4-C5D6",
      status: "UNASSIGNED" as const,
    },
  ];

  let count = 0;

  for (const cardData of cards) {
    // Skip if employee doesn't exist
    if (
      cardData.employeeUsername &&
      !validUsernames.has(cardData.employeeUsername)
    ) {
      console.warn(
        `  ⚠️  Skipping card ${cardData.cardId}: employee ${cardData.employeeUsername} not found`,
      );
      continue;
    }

    try {
      const card = await prisma.accessCard.upsert({
        where: { cardId: cardData.cardId },
        update: {
          employeeUsername: cardData.employeeUsername || null,
          status: cardData.status,
          assignedBy: cardData.assignedBy || null,
          assignedDate: cardData.employeeUsername ? new Date() : undefined,
        },
        create: {
          cardId: cardData.cardId,
          employeeUsername: cardData.employeeUsername || null,
          status: cardData.status,
          assignedBy: cardData.assignedBy || null,
          assignedDate: cardData.employeeUsername ? new Date() : undefined,
        },
      });

      count++;
      console.log(`  ✅ Access Card: ${card.cardId}`);
    } catch (error) {
      console.error(
        `  ❌ Failed to seed access card ${cardData.cardId}:`,
        error,
      );
    }
  }

  console.log(`✨ Seeded ${count} access cards`);
}

async function seedMaterials() {
  console.log("📦 Seeding materials...");

  // Materials use 材種コード [A-Z][0-9]{2}[A-Z][0-9]{4} and codes from material-grade
  // mfrCode: A,B,C,D | mfrGradeCode: 1,2,3 | shapeCode: A,B,0 | typeCode: 1,2,...
  const materials = [
    {
      code: "A01A0001",
      description: "Axis AF308 Standard",
      notes: "Standard grade",
      mfrCode: "A",
      mfrGradeCode: 1,
      shapeCode: "A",
      typeCode: 1,
    },
    {
      code: "A02A0001",
      description: "Axis AF510 Standard",
      notes: "Standard grade",
      mfrCode: "A",
      mfrGradeCode: 2,
      shapeCode: "A",
      typeCode: 1,
    },
    {
      code: "B01B0001",
      description: "AFC K10UF OH Stepped",
      notes: "OH shape stepped",
      mfrCode: "B",
      mfrGradeCode: 1,
      shapeCode: "B",
      typeCode: 1,
    },
    {
      code: "B02B0002",
      description: "AFC K40UF OH Straight drill",
      notes: "OH shape",
      mfrCode: "B",
      mfrGradeCode: 2,
      shapeCode: "B",
      typeCode: 2,
    },
    {
      code: "C01O0001",
      description: "GESAC GU20F Cylinder",
      notes: "Cylinder shape, type auto-increment",
      mfrCode: "C",
      mfrGradeCode: 1,
      shapeCode: "0",
      typeCode: 1,
    },
    {
      code: "D01A0001",
      description: "Ceratizit CTS20D Standard",
      notes: "Standard grade",
      mfrCode: "D",
      mfrGradeCode: 1,
      shapeCode: "A",
      typeCode: 1,
    },
  ];

  const createdMaterials = [];

  for (const materialData of materials) {
    try {
      const material = await prisma.material.upsert({
        where: { code: materialData.code },
        update: {
          description: materialData.description,
          notes: materialData.notes,
          mfrCode: materialData.mfrCode,
          mfrGradeCode: materialData.mfrGradeCode,
          shapeCode: materialData.shapeCode,
          typeCode: materialData.typeCode,
        },
        create: materialData,
      });

      createdMaterials.push(material);
      console.log(
        `  ✅ Material: ${material.code} - ${material.description || material.code}`,
      );
    } catch (error) {
      console.error(
        `  ❌ Failed to seed material ${materialData.code}:`,
        error,
      );
    }
  }

  console.log(`✨ Seeded ${createdMaterials.length} materials`);
  return createdMaterials;
}

async function seedProducts(materials: Array<{ id: number; code: string }>) {
  console.log("📋 Seeding products...");

  if (materials.length === 0) {
    console.warn("⚠️  No materials available, skipping products");
    return [];
  }

  // 製品コード: PRD-YYYYMM-NNNN e.g. PRD-2601-0001
  const productYearMonth = "2601"; // Jan 2026
  const productsToSeed = [];
  for (let i = 1; i <= 10; i++) {
    const seq = String(i).padStart(4, "0");
    const materialIndex = (i - 1) % materials.length;
    const material = materials[materialIndex];

    for (
      let version = 1;
      version <= Math.floor(Math.random() * 5) + 1;
      version++
    ) {
      productsToSeed.push({
        code: `PRD-${productYearMonth}-${seq}`,
        name: `Product ${i}`,
        description: `Product ${i} description.\nVersion ${version}.`,
        version,
        isParent: true,
        materialCode: material.code,
        shape: "Standard",
        classification: `Type ${((i - 1) % 3) + 1}`,
        materialNominalDiameter: i * 10,
        materialLength: (10 + i * 5) * 10,
        bladeCount: 5 + i * 2,
        coatingType: `BM-${seq}`,
        specMemo: `<p>Product ${i} version ${version} spec memo.</p>`,
      });
    }
  }

  console.log(`  📝 Generated ${productsToSeed.length} products to seed`);

  const createdProducts = [];

  for (const itemData of productsToSeed) {
    const material = materials.find((m) => m.code === itemData.materialCode);
    if (!material) {
      console.warn(
        `⚠️  Material ${itemData.materialCode} not found for product ${itemData.code}`,
      );
      continue;
    }

    try {
      const existingProduct = await prisma.product.findFirst({
        where: {
          code: itemData.code,
          version: itemData.version,
        },
      });

      const productData = {
        name: itemData.name,
        description: itemData.description,
        isParent: itemData.isParent,
        materialId: material.id,
        shape: itemData.shape,
        classification: itemData.classification,
        materialNominalDiameter: itemData.materialNominalDiameter,
        materialLength: itemData.materialLength,
        bladeCount: itemData.bladeCount,
        coatingType: itemData.coatingType,
        specMemo: itemData.specMemo,
      };

      const product = existingProduct
        ? await prisma.product.update({
            where: { id: existingProduct.id },
            data: productData,
          })
        : await prisma.product.create({
            data: {
              code: itemData.code,
              version: itemData.version,
              ...productData,
            },
          });

      createdProducts.push(product);
      console.log(
        `  ✅ Product: ${product.code} v${product.version} - ${product.name ?? product.description}`,
      );
    } catch (error) {
      console.error(
        `  ❌ Failed to seed product ${itemData.code} v${itemData.version}:`,
        error,
      );
    }
  }

  console.log(`✨ Seeded ${createdProducts.length} products`);
  return createdProducts;
}

async function seedCompanies() {
  console.log("🏛️ Seeding companies...");

  const existingCount = await prisma.company.count();
  if (existingCount > 0) {
    console.log(
      `⚠️  Found ${existingCount} existing companies, skipping seeding`,
    );
    return [];
  }

  const companies = [
    { code: "COMP-001", name: "Demo Corp", namePho: "Demo Corp" },
    {
      code: "COMP-002",
      name: "Sample Industries",
      namePho: "Sample Industries",
    },
    { code: "COMP-003", name: "Test Co", namePho: "Test Co" },
  ];
  const created: Array<{ id: number }> = [];
  for (const c of companies) {
    try {
      const company = await prisma.company.create({
        data: { ...c, isActive: true, zone: "JPN" },
      });
      created.push(company);
      console.log(`  ✅ Company: ${company.code}`);
    } catch (error) {
      console.error(`  ❌ Failed to seed company ${c.code}:`, error);
    }
  }
  console.log(`✨ Seeded ${created.length} companies`);
  return created;
}

async function seedCustomers() {
  console.log("🏢 Seeding customers (branches)...");

  const existingCount = await prisma.customer.count();
  if (existingCount > 0) {
    console.log(
      `⚠️  Found ${existingCount} existing customers, skipping seeding`,
    );
    return;
  }

  const companies = await prisma.company.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (companies.length === 0) {
    console.warn("  ⚠️ No companies found; seeding customers without company.");
  }

  // Create customers: some with company+branch, some standalone; mix purchaser/end-user flags
  const customerSpecs: Array<{
    code: string;
    companyIndex?: number;
    branchName: string;
    name: string;
    canBePurchaseCustomer: boolean;
    canBeEndUser: boolean;
  }> = [
    {
      code: "CUST-0001",
      companyIndex: 0,
      branchName: "本社",
      name: "Demo Corp 本社",
      canBePurchaseCustomer: true,
      canBeEndUser: false,
    },
    {
      code: "CUST-0002",
      companyIndex: 0,
      branchName: "工場A",
      name: "Demo Corp 工場A",
      canBePurchaseCustomer: true,
      canBeEndUser: true,
    },
    {
      code: "CUST-0003",
      companyIndex: 1,
      branchName: "本社",
      name: "Sample Industries 本社",
      canBePurchaseCustomer: true,
      canBeEndUser: false,
    },
    {
      code: "CUST-0004",
      companyIndex: 1,
      branchName: "支店1",
      name: "Sample Industries 支店1",
      canBePurchaseCustomer: true,
      canBeEndUser: true,
    },
    {
      code: "CUST-0005",
      companyIndex: 2,
      branchName: "本社",
      name: "Test Co 本社",
      canBePurchaseCustomer: true,
      canBeEndUser: true,
    },
    {
      code: "CUST-0006",
      branchName: "単独顧客1",
      name: "単独顧客1",
      canBePurchaseCustomer: true,
      canBeEndUser: false,
    },
    {
      code: "CUST-0007",
      branchName: "単独顧客2",
      name: "単独顧客2",
      canBePurchaseCustomer: true,
      canBeEndUser: true,
    },
    {
      code: "CUST-0008",
      companyIndex: 0,
      branchName: "営業所",
      name: "Demo Corp 営業所",
      canBePurchaseCustomer: true,
      canBeEndUser: false,
    },
    {
      code: "CUST-0009",
      companyIndex: 2,
      branchName: "支社",
      name: "Test Co 支社",
      canBePurchaseCustomer: false,
      canBeEndUser: true,
    },
    {
      code: "CUST-0010",
      branchName: "エンドユーザー専用",
      name: "エンドユーザー専用",
      canBePurchaseCustomer: false,
      canBeEndUser: true,
    },
  ];

  for (const spec of customerSpecs) {
    try {
      const companyId =
        spec.companyIndex != null && companies[spec.companyIndex]
          ? companies[spec.companyIndex].id
          : null;
      const customer = await prisma.customer.create({
        data: {
          code: spec.code,
          companyId,
          branchName: spec.branchName,
          name: spec.name,
          canBePurchaseCustomer: spec.canBePurchaseCustomer,
          canBeEndUser: spec.canBeEndUser,
          isActive: true,
          zone: "JPN",
        },
      });
      console.log(`  ✅ Customer: ${customer.code} (${customer.name})`);
    } catch (error) {
      console.error(`  ❌ Failed to seed customer ${spec.code}:`, error);
    }
  }

  const count = await prisma.customer.count();
  console.log(`✨ Seeded ${count} customers`);
}

async function seedPriceLists() {
  console.log("📋 Seeding price lists (customer × item, tiers)...");

  const existingCount = await prisma.priceList.count();
  if (existingCount > 0) {
    console.log(
      `⚠️  Found ${existingCount} existing price lists, skipping seeding`,
    );
    return;
  }

  const customers = await prisma.customer.findMany({
    select: { id: true, code: true, name: true },
    where: { canBePurchaseCustomer: true, isDeleted: false },
    orderBy: { id: "asc" },
    take: 5,
  });
  const products = await prisma.product.findMany({
    select: { id: true, code: true, name: true },
    where: { isDeleted: false },
    orderBy: { id: "asc" },
    take: 5,
  });

  if (customers.length === 0 || products.length === 0) {
    console.warn(
      "  ⚠️ No customers or products found; skipping price list seeding",
    );
    return;
  }

  const now = new Date();
  const validFromPast = new Date(now);
  validFromPast.setMonth(validFromPast.getMonth() - 1);
  const validFromFuture = new Date(now);
  validFromFuture.setMonth(validFromFuture.getMonth() + 1);

  let created = 0;
  for (let ci = 0; ci < customers.length; ci++) {
    for (let pi = 0; pi < products.length; pi++) {
      // Skip some combinations so we don't create too many
      if ((ci + pi) % 2 !== 0) continue;

      try {
        const validFrom =
          (ci + pi) % 3 === 0
            ? null
            : (ci + pi) % 3 === 1
              ? validFromPast
              : validFromFuture;

        const priceList = await prisma.priceList.create({
          data: {
            customerId: customers[ci].id,
            productId: products[pi].id,
            currency: "JPY",
            validFrom,
            tiers: {
              create: [
                { minQuantity: 0, maxQuantity: 5, unitPrice: 3000, currency: "JPY" },
                { minQuantity: 6, maxQuantity: 10, unitPrice: 2800, currency: "JPY" },
                { minQuantity: 11, maxQuantity: 49, unitPrice: 2600, currency: "JPY" },
                { minQuantity: 50, maxQuantity: null, unitPrice: 2500, currency: "JPY" },
              ],
            },
          },
          include: { tiers: true },
        });
        created++;
        console.log(
          `  ✅ Price list: ${customers[ci].code} × ${products[pi].code} (${priceList.tiers.length} tiers)`,
        );
      } catch (error) {
        console.error(
          `  ❌ Failed to seed price list ${customers[ci].code} × ${products[pi].code}:`,
          error,
        );
      }
    }
  }

  console.log(`✨ Seeded ${created} price lists`);
}

async function seedAddresses() {
  console.log("📍 Seeding addresses (per customer)...");

  const existingCount = await prisma.address.count();
  if (existingCount > 0) {
    console.log(
      `⚠️  Found ${existingCount} existing addresses, skipping seeding`,
    );
    return;
  }

  const customers = await prisma.customer.findMany({
    select: { id: true, name: true },
    orderBy: { id: "asc" },
    take: 8,
  });

  for (const customer of customers) {
    try {
      await prisma.address.create({
        data: {
          customerId: customer.id,
          label: "本社",
          postalCode: "100-0001",
          prefecture: "東京都",
          addressLine1: "千代田区サンプル1-2-3",
          phone: "03-1234-5678",
          isDefault: true,
        },
      });
      console.log(`  ✅ Address for customer ${customer.id}`);
    } catch (error) {
      console.error(
        `  ❌ Failed to seed address for customer ${customer.id}:`,
        error,
      );
    }
  }

  const count = await prisma.address.count();
  console.log(`✨ Seeded ${count} addresses`);
}

async function seedFactories() {
  console.log("🏭 Seeding factories...");

  const factories = [
    { code: "HONSHA", name: "本社", namePho: "ほんしゃ", zone: "JPN" as const },
    { code: "YAMAGUCHI", name: "山口", namePho: "やまぐち", zone: "JPN" as const },
    { code: "YAMAGATA", name: "山形", namePho: "やまがた", zone: "JPN" as const },
    { code: "OKINAWA", name: "沖縄", namePho: "おきなわ", zone: "JPN" as const },
    { code: "TSP", name: "TSP", namePho: null, zone: "SEA" as const },
  ];

  for (const f of factories) {
    try {
      const factory = await prisma.factory.upsert({
        where: { code: f.code },
        update: { name: f.name, namePho: f.namePho, zone: f.zone },
        create: { code: f.code, name: f.name, namePho: f.namePho, zone: f.zone },
      });
      console.log(`  ✅ Factory: ${factory.code} (${factory.name})`);
    } catch (error) {
      console.error(`  ❌ Failed to seed factory ${f.code}:`, error);
    }
  }

  console.log(`✨ Seeded ${factories.length} factories`);
}

async function seedMachines() {
  console.log("🔧 Seeding machines...");

  const factories = await prisma.factory.findMany({
    where: { isDeleted: false },
    orderBy: { id: "asc" },
  });

  if (factories.length === 0) {
    console.warn("⚠️  No factories available, skipping machines");
    return [];
  }

  const machinesToSeed: Array<{
    manufacturer: string;
    type: string;
    modelNumber: string;
    factoryCode: string;
    location: string;
  }> = [];

  for (let f = 0; f < factories.length; f++) {
    const factory = factories[f];
    for (let i = 1; i <= 3; i++) {
      machinesToSeed.push({
        manufacturer: `Mfr-${factory.code}`,
        type: f === 0 ? "CNC" : "Inspection",
        modelNumber: `${factory.code}-M${i}`,
        factoryCode: factory.code,
        location: `Line ${i}`,
      });
    }
  }

  const created: Array<{ id: number; factoryId: number }> = [];

  for (const m of machinesToSeed) {
    const factory = factories.find((f) => f.code === m.factoryCode);
    if (!factory) continue;

    try {
      const existing = await prisma.machine.findFirst({
        where: {
          factoryId: factory.id,
          isDeleted: false,
          modelNumber: m.modelNumber,
        },
      });

      if (existing) {
        created.push({ id: existing.id, factoryId: existing.factoryId });
        continue;
      }

      const machine = await prisma.machine.create({
        data: {
          manufacturer: m.manufacturer,
          type: m.type,
          modelNumber: m.modelNumber,
          factoryId: factory.id,
          location: m.location,
        },
      });
      created.push({ id: machine.id, factoryId: machine.factoryId });
      console.log(`  ✅ Machine: ${m.modelNumber} @ ${m.factoryCode}`);
    } catch (error) {
      console.error(`  ❌ Failed to seed machine ${m.modelNumber}:`, error);
    }
  }

  console.log(`✨ Seeded ${created.length} machines`);
  return created;
}

async function seedMachineAndInspectionPrograms(
  products: Array<{ id: number }>,
  machines: Array<{ id: number; factoryId: number }>,
) {
  if (products.length === 0 || machines.length === 0) {
    console.log(
      "⚠️  Skipping machine/inspection programs (no products or machines)",
    );
    return;
  }

  console.log("📋 Seeding machine programs and inspection programs...");

  const product = products[0];
  const machineIds = machines.slice(0, 2).map((m) => m.id);

  try {
    const existingMp = await prisma.machineProgram.findFirst({
      where: { productId: product.id, isDeleted: false },
    });
    if (!existingMp) {
      await prisma.machineProgram.create({
        data: {
          productId: product.id,
          processingLocation: "Main line",
          executionTimeMinutes: 30,
          programFilePath: "/programs/demo-mach.nc",
          stepTemplates: {
            create: [
              { value: "STEP-001", sortOrder: 0 },
              { value: "STEP-002", sortOrder: 1 },
            ],
          },
          machines: {
            create: machineIds.map((machineId) => ({ machineId })),
          },
        },
      });
      console.log("  ✅ Machine program for product", product.id);
    }

    const existingIp = await prisma.inspectionProgram.findFirst({
      where: { productId: product.id, isDeleted: false },
    });
    if (!existingIp) {
      await prisma.inspectionProgram.create({
        data: {
          productId: product.id,
          executionTimeMinutes: 10,
          programFilePath: "/programs/demo-insp.nc",
          stepTemplates: {
            create: [{ value: "INS-001", sortOrder: 0 }],
          },
          machines: {
            create: machineIds.map((machineId) => ({ machineId })),
          },
        },
      });
      console.log("  ✅ Inspection program for product", product.id);
    }
  } catch (error) {
    console.error("  ❌ Failed to seed machine/inspection programs:", error);
  }
}

async function seedSuppliers() {
  console.log("🏭 Seeding suppliers...");

  const existingCount = await prisma.supplier.count();
  if (existingCount > 0) {
    console.log(
      `⚠️  Found ${existingCount} existing suppliers, skipping seeding`,
    );
    return [];
  }

  const suppliers = [
    {
      code: "SUP-001",
      name: "Steel Supplier Co",
      namePho: "Steel Supplier Co",
      postalCode: "100-0001",
      phone: "03-1234-5678",
      email: "contact@steelsupplier.co.jp",
      address: "Tokyo, Japan",
      contactPerson: "Tanaka Taro",
      notes: "Primary steel supplier",
      isActive: true,
      zone: "JPN" as const,
    },
    {
      code: "SUP-002",
      name: "Aluminum Materials Inc",
      namePho: "Aluminum Materials Inc",
      postalCode: "200-0002",
      phone: "03-2345-6789",
      email: "info@aluminum.co.jp",
      address: "Osaka, Japan",
      contactPerson: "Suzuki Hanako",
      notes: "Aluminum specialist",
      isActive: true,
      zone: "JPN" as const,
    },
    {
      code: "SUP-003",
      name: "Metal Works Ltd",
      namePho: "Metal Works Ltd",
      postalCode: "300-0003",
      phone: "03-3456-7890",
      email: "sales@metalworks.co.jp",
      address: "Nagoya, Japan",
      contactPerson: "Yamada Jiro",
      notes: "Various metal materials",
      isActive: true,
      zone: "JPN" as const,
    },
  ];

  const createdSuppliers = [];

  for (const supplierData of suppliers) {
    try {
      const supplier = await prisma.supplier.upsert({
        where: {
          code: supplierData.code,
        },
        update: {},
        create: supplierData,
      });
      createdSuppliers.push(supplier);
      console.log(`  ✅ Supplier: ${supplier.code} - ${supplier.name}`);
    } catch (error) {
      console.error(
        `  ❌ Failed to seed supplier ${supplierData.code}:`,
        error,
      );
    }
  }

  console.log(`✨ Seeded ${createdSuppliers.length} suppliers`);
  return createdSuppliers;
}

async function seedStockPurchases(
  suppliers: Array<{ id: number }>,
  materials: Array<{ id: number }>,
  employees?: Array<{ username: string }>,
) {
  console.log("🛒 Seeding stock purchases...");

  // If suppliers array is empty, fetch existing suppliers from database
  let suppliersToUse = suppliers;
  if (suppliersToUse.length === 0) {
    suppliersToUse = await prisma.supplier.findMany({
      select: { id: true },
      where: { isActive: true },
    });
  }

  // If materials array is empty, fetch existing materials from database
  let materialsToUse = materials;
  if (materialsToUse.length === 0) {
    materialsToUse = await prisma.material.findMany({
      select: { id: true },
    });
  }

  if (suppliersToUse.length === 0 || materialsToUse.length === 0) {
    console.warn(
      "⚠️  No suppliers or materials available, skipping stock purchases",
    );
    return [];
  }

  // Get employees for purchase items (required field)
  let employeesToUse = employees;
  if (!employeesToUse || employeesToUse.length === 0) {
    employeesToUse = await prisma.employee.findMany({
      select: { username: true },
      where: { isEnabled: true },
    });
  }

  if (employeesToUse.length === 0) {
    console.warn("⚠️  No employees available, skipping stock purchases");
    return [];
  }

  // Get factories for stock assignment
  // Try active factories first, fallback to all factories if none are active
  let factories = await prisma.factory.findMany({
    select: { id: true },
    where: { isActive: true },
  });

  if (factories.length === 0) {
    // Fallback to all factories if no active ones exist
    factories = await prisma.factory.findMany({
      select: { id: true },
    });
  }

  if (factories.length === 0) {
    console.warn("⚠️  No factories available, skipping stock purchases");
    return [];
  }

  const getRandomElement = <T>(array: T[]): T =>
    array[Math.floor(Math.random() * array.length)];

  const createdPurchases = [];

  // Create 10 stock purchases
  for (let i = 1; i <= 10; i++) {
    const supplier = getRandomElement(suppliersToUse);
    const purchaseDate = new Date();
    purchaseDate.setDate(
      purchaseDate.getDate() - Math.floor(Math.random() * 90),
    ); // Random date in last 90 days

    try {
      // 請求書コード: INV-YYYYMM-NNNNN e.g. INV-2601-00001
      const invYearMonth = "2601";
      const invoiceNumber = `INV-${invYearMonth}-${String(i).padStart(5, "0")}`;
      // Check if purchase already exists
      let purchase = await prisma.stockPurchase.findFirst({
        where: {
          invoiceNumber: invoiceNumber,
        },
      });

      if (!purchase) {
        // Get a random employee for the purchase (required field)
        const purchaseEmployee = getRandomElement(employeesToUse);

        purchase = await prisma.stockPurchase.create({
          data: {
            supplierId: supplier.id,
            purchaseDate: purchaseDate,
            invoiceNumber: invoiceNumber,
            purchaseOrderNumber: `PO-${String(i).padStart(6, "0")}`,
            totalAmount: 0, // Will be calculated from items
            currency: "JPY",
            notes: `Purchase order ${i}`,
            employeeUsername: purchaseEmployee.username, // Required field for permission checks
          },
        });

        // Create 2-5 purchase items per purchase (only if purchase was just created)
        const numItems = Math.floor(Math.random() * 4) + 2;
        let totalAmount = 0;

        for (let j = 0; j < numItems; j++) {
          const material = getRandomElement(materialsToUse);
          const diameter = Math.floor(Math.random() * 50) + 10; // 10-60mm
          const length = Math.floor(Math.random() * 900) + 100; // 100-999mm (max length 999mm)
          const polished = Math.random() > 0.5;
          const quantity = Math.floor(Math.random() * 20) + 5; // 5-25 pieces
          const pricePerPiece = Math.floor(Math.random() * 5000) + 1000; // 1000-6000 JPY
          const pricePerUnit = (pricePerPiece / length) * 1000; // Price per 1000mm

          const itemTotal = pricePerPiece * quantity;
          totalAmount += itemTotal;

          // Assign stock to a random factory (same factory for purchase item and stock)
          const factory = getRandomElement(factories);

          await prisma.stockPurchaseItem.create({
            data: {
              stockPurchaseId: purchase.id,
              materialId: material.id,
              factoryId: factory.id,
              diameter: diameter,
              nominalDiameter: diameter, // 呼び径 (seed: same as 直径)
              length: length,
              polished: polished,
              customType: "-", // Required field with default value "-"
              quantity: quantity,
              pricePerPiece: pricePerPiece,
              pricePerUnit: pricePerUnit,
              currency: "JPY",
            },
          });

          // Update or create Stock entry (with factoryId)
          // Note: customType is optional, use "-" as default value instead of null
          await prisma.stock.upsert({
            where: {
              materialId_diameter_length_polished_customType_factoryId: {
                materialId: material.id,
                diameter: diameter,
                length: length,
                polished: polished,
                customType: "-", // Required field with default value "-"
                factoryId: factory.id,
              },
            },
            update: {
              availableQuantity: {
                increment: quantity,
              },
            },
            create: {
              materialId: material.id,
              diameter: diameter,
              nominalDiameter: diameter, // 呼び径 (seed: same as 直径)
              length: length,
              polished: polished,
              customType: "-", // Required field with default value "-"
              factoryId: factory.id,
              availableQuantity: quantity,
            },
          });
        }

        // Update purchase total amount
        await prisma.stockPurchase.update({
          where: { id: purchase.id },
          data: { totalAmount: totalAmount },
        });
      }

      createdPurchases.push(purchase);
      console.log(`  ✅ Stock Purchase: ${purchase.invoiceNumber}`);
    } catch (error) {
      console.error(`  ❌ Failed to seed stock purchase ${i}:`, error);
    }
  }

  console.log(`✨ Seeded ${createdPurchases.length} stock purchases`);
  return createdPurchases;
}

async function seedOrders() {
  console.log("📦 Seeding demo orders...");

  // Get all required data
  const employees = await prisma.employee.findMany({
    select: { username: true },
    where: { isEnabled: true },
  });
  const customers = await prisma.customer.findMany({
    select: { id: true },
    where: { canBePurchaseCustomer: true },
  });
  const endUserCustomers = await prisma.customer.findMany({
    select: { id: true },
    where: { canBeEndUser: true },
  });
  const factories = await prisma.factory.findMany({
    select: { id: true },
  });
  const products = await prisma.product.findMany({
    select: { id: true, code: true, version: true },
  });

  if (
    employees.length === 0 ||
    customers.length === 0 ||
    factories.length === 0 ||
    products.length === 0
  ) {
    console.warn(
      "⚠️  Missing required data (employees, customers, factories, or products), skipping order seeding",
    );
    return;
  }

  const orderStatuses: Array<
    "DRAFT" | "PENDING" | "ORDERED" | "COMPLETED" | "CANCELLED" | "ARCHIVED"
  > = ["DRAFT", "PENDING", "ORDERED", "COMPLETED", "CANCELLED", "ARCHIVED"];

  // Helper functions
  const getRandomElement = <T>(array: T[]): T =>
    array[Math.floor(Math.random() * array.length)];

  const getRandomDate = (start: Date, end: Date): Date => {
    return new Date(
      start.getTime() + Math.random() * (end.getTime() - start.getTime()),
    );
  };

  // 受注書コード ORD-YYYYMM-NNNNN, 見積書コード QOT-YYYYMM-NNNNN
  const docYearMonth = "2601"; // Jan 2026
  const createdOrders = [];
  const orderCodes = new Set<string>();
  const receiptCodes = new Set<string>();

  for (let i = 1; i <= 200; i++) {
    const ordSeq = String(i).padStart(5, "0");
    const orderCode = `ORD-${docYearMonth}-${ordSeq}`;
    orderCodes.add(orderCode);

    const qotSeq = String(i).padStart(5, "0");
    const receiptCode = `QOT-${docYearMonth}-${qotSeq}`;
    receiptCodes.add(receiptCode);

    const employee = getRandomElement(employees);
    const customer = getRandomElement(customers);
    const product = getRandomElement(products);
    const status = getRandomElement(orderStatuses);
    // Optional end user (customer_id): use only when we have end-user customers
    const endUserId =
      endUserCustomers.length > 0 && Math.random() < 0.3
        ? getRandomElement(endUserCustomers).id
        : null;

    // Generate random dates (order date in the past 6 months, delivery date 1-3 months after)
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const orderDate = getRandomDate(sixMonthsAgo, now);
    const receivedAt = new Date(orderDate.getTime() - 86400000); // 1 day before order date

    const deliveryDate = new Date(orderDate);
    deliveryDate.setMonth(
      deliveryDate.getMonth() + Math.floor(Math.random() * 3) + 1,
    );

    // Random quantity and total amount for the order
    const orderedQuantity = Math.floor(Math.random() * 20) + 5; // 5-25
    const totalQuantity = orderedQuantity; // seed: same as ordered; totalQuantity >= orderedQuantity
    const totalAmount = Math.floor(Math.random() * 990000) + 10000;
    const unitPrice = totalAmount / totalQuantity;

    try {
      const receipt = await prisma.orderReceipt.upsert({
        where: { code: receiptCode },
        update: {},
        create: {
          code: receiptCode,
          customerId: customer.id,
          receivedAt,
          employeeUsername: employee.username,
          orderDate: orderDate,
          deliveryDate: deliveryDate,
          totalAmount: totalAmount, // 注文受取書合計（1 order per receipt in seed）
          notes: `Demo 注文受取書 ${i}`,
        },
      });

      const order = await prisma.order.upsert({
        where: {
          code: orderCode,
        },
        update: {},
        create: {
          code: orderCode,
          orderReceiptId: receipt.id,
          productId: product.id,
          status: status as never,
          currency: "JPY",
          orderedQuantity,
          totalQuantity,
          unitPrice,
          totalAmount: totalAmount,
          zone: "JPN",
          endUserId: endUserId ?? undefined,
          notes: `Demo order ${i} with ${product.code} v${product.version}`,
        },
      });

      createdOrders.push(order);
      if (i % 50 === 0) {
        console.log(`  ✅ Created ${i} orders...`);
      }
    } catch (error) {
      console.error(`  ❌ Failed to seed order ${orderCode}:`, error);
    }
  }

  console.log(`✨ Seeded ${createdOrders.length} demo orders`);
  return createdOrders;
}

async function seedEmployeeZones(employees: Array<{ username: string }>) {
  console.log("🌍 Seeding employee zones...");

  let count = 0;

  for (const employee of employees) {
    try {
      await prisma.employeeZone.upsert({
        where: {
          employeeUsername_zone: {
            employeeUsername: employee.username,
            zone: "JPN",
          },
        },
        update: {},
        create: {
          employeeUsername: employee.username,
          zone: "JPN",
          assignedBy: "system",
        },
      });
      count++;
      console.log(`  ✅ Assigned ${employee.username} to JPN zone`);
    } catch (error) {
      console.error(
        `  ❌ Failed to assign ${employee.username} to JPN zone:`,
        error,
      );
    }
  }

  console.log(`✨ Seeded ${count} employee zone assignments`);
}

async function seedProcessTemplates() {
  console.log("⚙️  Seeding process templates...");

  // CKK 製造フロー (製造フロー.md): 材料準備 → 加工・コーティング → 出荷前検査 → 出荷
  const templates = [
    // 1. 材料（材料準備）
    {
      name: { ja: "素材出し（在庫）", en: "Material from stock" },
      description: { ja: "在庫の移動", en: "Move material from inventory" },
      displayOrder: 1,
      onStartLogicKey: "get_material_from_inventory",
      onCompleteLogicKey: null,
      customViewLogicKey: "get_material_view",
      stepKind: "MATERIAL_FROM_STOCK" as const,
      isSkippableInspection: false,
      specialKind: "INITIAL" as const,
    },
    {
      name: { ja: "半製品出し（在庫）", en: "Semi-finished from stock" },
      description: {
        ja: "在庫の移動。半製品にリブ母材を含む",
        en: "Move semi-finished from stock",
      },
      displayOrder: 2,
      onStartLogicKey: null,
      onCompleteLogicKey: null,
      customViewLogicKey: null,
      stepKind: "SEMI_FROM_STOCK" as const,
      isSkippableInspection: false,
      specialKind: "INITIAL" as const,
    },
    {
      name: { ja: "素材受渡し（受注先）", en: "Material handover from order" },
      description: {
        ja: "受注先から素材を受領",
        en: "Receive material from customer",
      },
      displayOrder: 3,
      onStartLogicKey: null,
      onCompleteLogicKey: null,
      customViewLogicKey: null,
      stepKind: "MATERIAL_HANDOVER" as const,
      isSkippableInspection: false,
      specialKind: "INITIAL" as const,
    },
    {
      name: { ja: "製品受渡し（受注先）", en: "Product handover from order" },
      description: {
        ja: "受注先から製品を受領",
        en: "Receive product from customer",
      },
      displayOrder: 4,
      onStartLogicKey: null,
      onCompleteLogicKey: null,
      customViewLogicKey: null,
      stepKind: "PRODUCT_HANDOVER" as const,
      isSkippableInspection: false,
      specialKind: "INITIAL" as const,
    },
    {
      name: { ja: "切断", en: "Cut" },
      description: {
        ja: "必要な寸法に材料を切断。複数回あり",
        en: "Cut material to required dimensions",
      },
      displayOrder: 5,
      onStartLogicKey: null,
      onCompleteLogicKey: "cut_material",
      customViewLogicKey: "cut_material_view",
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    {
      name: { ja: "センタレス", en: "Centerless" },
      description: {
        ja: "外注時：依頼日・入荷予定日・入荷日を管理",
        en: "Centerless grinding (in-house or outsourced)",
      },
      displayOrder: 6,
      onStartLogicKey: null,
      onCompleteLogicKey: null,
      customViewLogicKey: null,
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    {
      name: { ja: "円筒加工", en: "Cylindrical machining" },
      description: {
        ja: "円筒加工。使用依存：素材手配、円筒加工検査、円筒加工検査承認",
        en: "Cylindrical machining",
      },
      displayOrder: 7,
      onStartLogicKey: null,
      onCompleteLogicKey: null,
      customViewLogicKey: null,
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    {
      name: { ja: "円筒加工検査", en: "Cylindrical inspection" },
      description: {
        ja: "検査表の完成確認（製作）",
        en: "Cylindrical machining inspection",
      },
      displayOrder: 8,
      onStartLogicKey: null,
      onCompleteLogicKey: "quality_check",
      customViewLogicKey: "quality_check_view",
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    {
      name: { ja: "円筒加工検査承認", en: "Cylindrical inspection approval" },
      description: {
        ja: "係長以上が承認",
        en: "Supervisor approval for cylindrical inspection",
      },
      displayOrder: 9,
      onStartLogicKey: null,
      onCompleteLogicKey: null,
      customViewLogicKey: null,
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    {
      name: { ja: "全長合わせ", en: "Length alignment" },
      description: {
        ja: "センタレス or 円筒加工検査承認 or 素材が研磨の完了後",
        en: "Align total length",
      },
      displayOrder: 10,
      onStartLogicKey: null,
      onCompleteLogicKey: null,
      customViewLogicKey: null,
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    {
      name: { ja: "C面", en: "C-face" },
      description: { ja: "角取り", en: "Chamfer (C-face)" },
      displayOrder: 11,
      onStartLogicKey: null,
      onCompleteLogicKey: null,
      customViewLogicKey: null,
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    // 2. 加工・コーティング
    {
      name: { ja: "マーキング", en: "Marking" },
      description: {
        ja: "実行依存：素材準備済み and 円筒検査承認",
        en: "Marking",
      },
      displayOrder: 12,
      onStartLogicKey: null,
      onCompleteLogicKey: null,
      customViewLogicKey: null,
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    {
      name: { ja: "段加工", en: "Step machining" },
      description: { ja: "他工程と同時実施・同時記録可", en: "Step machining" },
      displayOrder: 13,
      onStartLogicKey: null,
      onCompleteLogicKey: null,
      customViewLogicKey: null,
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    {
      name: { ja: "段加工検査", en: "Step machining inspection" },
      description: {
        ja: "検査表の完成確認（段加工）",
        en: "Step machining inspection",
      },
      displayOrder: 14,
      onStartLogicKey: null,
      onCompleteLogicKey: "quality_check",
      customViewLogicKey: "quality_check_view",
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    {
      name: { ja: "段加工検査承認", en: "Step inspection approval" },
      description: {
        ja: "係長以上が承認",
        en: "Supervisor approval for step inspection",
      },
      displayOrder: 15,
      onStartLogicKey: null,
      onCompleteLogicKey: null,
      customViewLogicKey: null,
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    {
      name: { ja: "溝（製作）", en: "Groove (manufacturing)" },
      description: {
        ja: "製作工程。他工程と同時実施・同時記録可",
        en: "Groove machining",
      },
      displayOrder: 16,
      onStartLogicKey: null,
      onCompleteLogicKey: null,
      customViewLogicKey: null,
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    {
      name: { ja: "外周（製作）", en: "Outer (manufacturing)" },
      description: {
        ja: "実行依存：溝の完了 and 円筒検査承認",
        en: "Outer circumference machining",
      },
      displayOrder: 17,
      onStartLogicKey: null,
      onCompleteLogicKey: null,
      customViewLogicKey: null,
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    {
      name: { ja: "先端（製作）", en: "Tip (manufacturing)" },
      description: {
        ja: "実行依存：溝の完了 and 円筒検査承認",
        en: "Tip machining",
      },
      displayOrder: 18,
      onStartLogicKey: null,
      onCompleteLogicKey: null,
      customViewLogicKey: null,
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    {
      name: { ja: "製作検査", en: "Manufacturing inspection" },
      description: {
        ja: "検査表の完成確認（製作）。実行依存：製作完了",
        en: "Manufacturing inspection",
      },
      displayOrder: 19,
      onStartLogicKey: null,
      onCompleteLogicKey: "quality_check",
      customViewLogicKey: "quality_check_view",
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    {
      name: { ja: "製作検査承認", en: "Manufacturing inspection approval" },
      description: {
        ja: "係長以上が承認",
        en: "Supervisor approval for manufacturing inspection",
      },
      displayOrder: 20,
      onStartLogicKey: null,
      onCompleteLogicKey: null,
      customViewLogicKey: null,
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    {
      name: { ja: "LD", en: "LD" },
      description: {
        ja: "使用依存：製作検査承認 or 製品受渡し、LD検査",
        en: "LD process",
      },
      displayOrder: 21,
      onStartLogicKey: null,
      onCompleteLogicKey: null,
      customViewLogicKey: null,
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    {
      name: { ja: "LD検査", en: "LD inspection" },
      description: { ja: "写真撮影の有無を確認", en: "LD inspection" },
      displayOrder: 22,
      onStartLogicKey: null,
      onCompleteLogicKey: "quality_check",
      customViewLogicKey: "quality_check_view",
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    {
      name: { ja: "コーティング", en: "Coating" },
      description: {
        ja: "社内・社外。使用依存：製作検査承認 or 製品受渡し",
        en: "Coating (in-house or outsourced)",
      },
      displayOrder: 23,
      onStartLogicKey: null,
      onCompleteLogicKey: null,
      customViewLogicKey: null,
      stepKind: "PROCESSING" as const,
      isSkippableInspection: false,
      specialKind: "NONE" as const,
    },
    // 出荷前検査・出荷
    {
      name: { ja: "出荷前検査", en: "Pre-shipment inspection" },
      description: {
        ja: "全工程の完了後。再研磨などで省略可。在庫で検査済みの場合は省略可",
        en: "Pre-shipment inspection (skippable)",
      },
      displayOrder: 24,
      onStartLogicKey: null,
      onCompleteLogicKey: "quality_check",
      customViewLogicKey: "quality_check_view",
      stepKind: "PRE_SHIPMENT_INSPECTION" as const,
      isSkippableInspection: true,
      specialKind: "FINAL" as const,
    },
  ];

  // Requirements by template English name (製造フロー.md: required_exist, required_before, requirementsWarning)
  const REQUIREMENTS: Record<
    string,
    {
      requiredExist?: string[];
      requiredBefore?: string[];
      requirementsWarning?: { ja: string; en: string };
    }
  > = {
    "Cylindrical machining": {
      requiredExist: [
        "Cylindrical inspection",
        "Cylindrical inspection approval",
      ],
      requiredBefore: [],
      requirementsWarning: {
        ja: "円筒加工を含む場合は円筒加工検査・円筒加工検査承認をワークフローに含めてください。",
        en: "When including cylindrical machining, include cylindrical inspection and approval in the workflow.",
      },
    },
    "Cylindrical inspection": {
      requiredExist: [
        "Cylindrical machining",
        "Cylindrical inspection approval",
      ],
      requiredBefore: ["Cylindrical machining"],
    },
    "Cylindrical inspection approval": {
      requiredExist: ["Cylindrical machining", "Cylindrical inspection"],
      requiredBefore: ["Cylindrical inspection"],
    },
    "Length alignment": {
      requiredBefore: ["Cylindrical inspection approval"],
    },
    "C-face": {
      requiredBefore: ["Length alignment"],
    },
    Marking: {
      requiredBefore: ["Cylindrical inspection approval"],
    },
    "Step machining": {
      requiredExist: ["Step machining inspection", "Step inspection approval"],
      requiredBefore: ["Cylindrical inspection approval"],
      requirementsWarning: {
        ja: "段加工を含む場合は段加工検査・段加工検査承認をワークフローに含めてください。",
        en: "When including step machining, include step inspection and approval in the workflow.",
      },
    },
    "Step machining inspection": {
      requiredExist: ["Step machining", "Step inspection approval"],
      requiredBefore: ["Step machining"],
    },
    "Step inspection approval": {
      requiredExist: ["Step machining", "Step inspection"],
      requiredBefore: ["Step machining inspection"],
    },
    "Groove (manufacturing)": {
      requiredExist: [
        "Manufacturing inspection",
        "Manufacturing inspection approval",
      ],
      requiredBefore: ["Cylindrical inspection approval"],
      requirementsWarning: {
        ja: "溝（製作）を含む場合は製作検査・製作検査承認をワークフローに含めてください。",
        en: "When including groove (manufacturing), include manufacturing inspection and approval in the workflow.",
      },
    },
    "Outer (manufacturing)": {
      requiredBefore: [
        "Cylindrical inspection approval",
        "Groove (manufacturing)",
      ],
    },
    "Tip (manufacturing)": {
      requiredBefore: [
        "Cylindrical inspection approval",
        "Groove (manufacturing)",
      ],
    },
    "Manufacturing inspection": {
      requiredExist: ["Manufacturing inspection approval"],
      requiredBefore: [
        "Groove (manufacturing)",
        "Outer (manufacturing)",
        "Tip (manufacturing)",
      ],
    },
    "Manufacturing inspection approval": {
      requiredExist: ["Manufacturing inspection"],
      requiredBefore: ["Manufacturing inspection"],
    },
    LD: {
      requiredExist: ["LD inspection"],
      requiredBefore: ["Manufacturing inspection approval"],
      requirementsWarning: {
        ja: "LDを含む場合はLD検査をワークフローに含めてください。",
        en: "When including LD, include LD inspection in the workflow.",
      },
    },
    "LD inspection": {
      requiredExist: ["LD"],
      requiredBefore: ["LD"],
    },
    Coating: {
      requiredBefore: ["Manufacturing inspection approval"],
    },
  };

  const createdTemplates = [];

  for (const templateData of templates) {
    try {
      // Check if template with same name exists (search by English name in JSON)
      const allTemplates = await prisma.processTemplate.findMany();
      const existing = allTemplates.find((t) => {
        const name = t.name as { ja?: string; en?: string } | null;
        return (
          name?.en === templateData.name.en || name?.ja === templateData.name.ja
        );
      });

      if (existing) {
        // Update existing template
        const template = await prisma.processTemplate.update({
          where: { id: existing.id },
          data: {
            name: templateData.name,
            description: templateData.description,
            displayOrder: templateData.displayOrder,
            onStartLogicKey: templateData.onStartLogicKey,
            onCompleteLogicKey: templateData.onCompleteLogicKey,
            customViewLogicKey: templateData.customViewLogicKey ?? null,
            stepKind: templateData.stepKind,
            isSkippableInspection: templateData.isSkippableInspection,
            specialKind: templateData.specialKind,
          },
        });
        createdTemplates.push(template);
        const name = template.name as { ja?: string; en?: string } | null;
        console.log(
          `  ✅ Updated Process Template: ${name?.en || name?.ja || "Unknown"}`,
        );
      } else {
        // Create new template
        const template = await prisma.processTemplate.create({
          data: templateData,
        });
        createdTemplates.push(template);
        const name = template.name as { ja?: string; en?: string } | null;
        console.log(
          `  ✅ Process Template: ${name?.en || name?.ja || "Unknown"}`,
        );
      }
    } catch (error) {
      const nameStr = templateData.name.en || templateData.name.ja || "Unknown";
      console.error(`  ❌ Failed to seed process template ${nameStr}:`, error);
    }
  }

  // Second pass: set required_exist, required_before, requirementsWarning (need template IDs)
  const allTemplatesAfter = await prisma.processTemplate.findMany({
    orderBy: { displayOrder: "asc" },
  });
  const nameEnToId = new Map<string, number>();
  for (const t of allTemplatesAfter) {
    const name = t.name as { en?: string } | null;
    if (name?.en) nameEnToId.set(name.en, t.id);
  }

  for (const template of allTemplatesAfter) {
    const name = template.name as { en?: string } | null;
    const en = name?.en;
    if (!en || !REQUIREMENTS[en]) continue;

    const req = REQUIREMENTS[en];
    const requiredExistIds = (req.requiredExist ?? [])
      .map((n) => nameEnToId.get(n))
      .filter((id): id is number => id != null);
    const requiredBeforeIds = (req.requiredBefore ?? [])
      .map((n) => nameEnToId.get(n))
      .filter((id): id is number => id != null);

    try {
      await prisma.processTemplate.update({
        where: { id: template.id },
        data: {
          requiredExistTemplateIds: requiredExistIds,
          requiredBeforeTemplateIds: requiredBeforeIds,
          ...(req.requirementsWarning != null && {
            requirementsWarning: req.requirementsWarning,
          }),
        },
      });
      console.log(
        `  ✅ Updated requirements: ${en} (exist: ${requiredExistIds.length}, before: ${requiredBeforeIds.length})`,
      );
    } catch (error) {
      console.error(`  ❌ Failed to update requirements for ${en}:`, error);
    }
  }

  console.log(`✨ Seeded ${createdTemplates.length} process templates`);
  return createdTemplates;
}

async function seedProcessPlans(
  orders?: Array<{ id: number; status: string; totalQuantity?: number }>,
) {
  console.log("📋 Seeding process plans...");

  const templates = await prisma.processTemplate.findMany({
    select: { id: true, name: true },
    orderBy: { displayOrder: "asc" },
  });

  if (templates.length === 0) {
    console.warn("⚠️  No process templates available, skipping process plans");
    return;
  }

  const employees = await prisma.employee.findMany({
    select: { username: true },
    where: { isEnabled: true },
  });

  if (employees.length === 0) {
    console.warn("⚠️  No employees available, skipping process plans");
    return;
  }

  const factories = await prisma.factory.findMany({
    select: { id: true },
    take: 20,
  });
  if (factories.length === 0) {
    console.warn("⚠️  No factories available, skipping process plans");
    return;
  }

  // If orders not provided, fetch them (include totalQuantity for process plan counts)
  const ordersToProcess =
    orders ||
    (await prisma.order.findMany({
      select: { id: true, status: true, totalQuantity: true },
      take: 100,
    }));

  if (ordersToProcess.length === 0) {
    console.warn("⚠️  No orders available, skipping process plans");
    return;
  }

  const getRandomElement = <T>(array: T[]): T =>
    array[Math.floor(Math.random() * array.length)];

  let count = 0;

  // Add process plans to orders with ORDERED status
  const orderedOrders = ordersToProcess.filter((o) => o.status === "ORDERED");
  const draftOrders = ordersToProcess.filter((o) => o.status === "DRAFT");

  // For ORDERED orders, add 2-4 process plans with READY status (factory is per step)
  // ProcessPlan belongs to ManufacturingWorkflow; create one workflow per order for seed
  for (const order of orderedOrders.slice(0, 50)) {
    let workflow = await prisma.manufacturingWorkflow.findFirst({
      where: { orderId: order.id },
    });
    if (!workflow) {
      workflow = await prisma.manufacturingWorkflow.create({
        data: {
          orderId: order.id,
          name: "Workflow 1",
          displayOrder: 0,
        },
      });
    }

    const factoryId = getRandomElement(factories).id;
    const orderQty: number =
      typeof order.totalQuantity === "number" ? order.totalQuantity : 10;
    const numPlans = Math.floor(Math.random() * 3) + 2;
    const selectedTemplates = templates
      .sort(() => Math.random() - 0.5)
      .slice(0, numPlans);

    let prevOutputSuccess = orderQty;
    for (let i = 0; i < selectedTemplates.length; i++) {
      const template = selectedTemplates[i];
      const employee = getRandomElement(employees);
      const inputQty: number = i === 0 ? orderQty : prevOutputSuccess;
      // Simulate small defects: 95–100% success, rest split between 半製品 / scrap / rework
      const successRate = 0.95 + Math.random() * 0.05;
      const outputSuccess = Math.round(inputQty * successRate);
      const defects = inputQty - outputSuccess;
      const defectSemi = Math.floor(defects * 0.4);
      const defectScrap = Math.floor(defects * 0.3);
      const defectRework = defects - defectSemi - defectScrap;
      prevOutputSuccess = outputSuccess;

      try {
        const planData = {
          sequence: i,
          assignedTo: employee.username,
          estimatedHours: Math.floor(Math.random() * 8) + 2, // 2-10 hours
          plannedAt: new Date(),
          status: "READY" as const,
          factoryId,
          inputQuantity: inputQty,
          outputSuccessQuantity: outputSuccess,
          outputDefectSemiFinished: defectSemi > 0 ? defectSemi : null,
          outputDefectScrap: defectScrap > 0 ? defectScrap : null,
          outputDefectRework: defectRework > 0 ? defectRework : null,
        };
        const existingPlan = await prisma.processPlan.findFirst({
          where: { workflowId: workflow.id, templateId: template.id },
        });
        if (existingPlan) {
          await prisma.processPlan.update({
            where: { id: existingPlan.id },
            data: planData,
          });
        } else {
          await prisma.processPlan.create({
            data: {
              workflowId: workflow.id,
              templateId: template.id,
              ...planData,
            },
          });
        }
        count++;
      } catch (error) {
        console.error(
          `  ❌ Failed to seed process plan for order ${order.id}:`,
          error,
        );
      }
    }
  }

  // For DRAFT orders, add 1-3 process plans with DRAFT status (factory is per step)
  for (const order of draftOrders.slice(0, 30)) {
    let workflow = await prisma.manufacturingWorkflow.findFirst({
      where: { orderId: order.id },
    });
    if (!workflow) {
      workflow = await prisma.manufacturingWorkflow.create({
        data: {
          orderId: order.id,
          name: "Workflow 1",
          displayOrder: 0,
        },
      });
    }

    const factoryId = getRandomElement(factories).id;
    const orderQty: number =
      typeof order.totalQuantity === "number" ? order.totalQuantity : 10;
    const numPlans = Math.floor(Math.random() * 3) + 1;
    const selectedTemplates = templates
      .sort(() => Math.random() - 0.5)
      .slice(0, numPlans);

    let prevOutputSuccess = orderQty;
    for (let i = 0; i < selectedTemplates.length; i++) {
      const template = selectedTemplates[i];
      const employee = getRandomElement(employees);
      const inputQty: number = i === 0 ? orderQty : prevOutputSuccess;
      const successRate = 0.96 + Math.random() * 0.04;
      const outputSuccess = Math.round(inputQty * successRate);
      const defects = inputQty - outputSuccess;
      const defectSemi = Math.floor(defects * 0.4);
      const defectScrap = Math.floor(defects * 0.3);
      const defectRework = defects - defectSemi - defectScrap;
      prevOutputSuccess = outputSuccess;

      try {
        const planData = {
          sequence: i,
          factoryId,
          assignedTo: employee.username,
          estimatedHours: Math.floor(Math.random() * 8) + 2,
          plannedAt: new Date(),
          status: "DRAFT" as const,
          inputQuantity: inputQty,
          outputSuccessQuantity: outputSuccess,
          outputDefectSemiFinished: defectSemi > 0 ? defectSemi : null,
          outputDefectScrap: defectScrap > 0 ? defectScrap : null,
          outputDefectRework: defectRework > 0 ? defectRework : null,
        };
        const existingPlan = await prisma.processPlan.findFirst({
          where: { workflowId: workflow.id, templateId: template.id },
        });
        if (existingPlan) {
          await prisma.processPlan.update({
            where: { id: existingPlan.id },
            data: planData,
          });
        } else {
          await prisma.processPlan.create({
            data: {
              workflowId: workflow.id,
              templateId: template.id,
              ...planData,
            },
          });
        }
        count++;
      } catch (error) {
        console.error(
          `  ❌ Failed to seed process plan for order ${order.id}:`,
          error,
        );
      }
    }
  }

  console.log(`✨ Seeded ${count} process plans`);
}

async function seedShippingInstructions() {
  console.log("📦 Seeding shipping instructions (delivery workflows)...");

  // Order has manufacturingWorkflows, not processPlans; get last-step output per workflow and sum
  const ordersWithWorkflows = await prisma.order.findMany({
    where: { isDeleted: false },
    select: {
      id: true,
      totalQuantity: true,
      orderReceipt: { select: { customerId: true } },
      manufacturingWorkflows: {
        select: {
          id: true,
          plans: {
            orderBy: { sequence: "desc" },
            take: 1,
            select: { outputSuccessQuantity: true },
          },
        },
      },
    },
    take: 80,
  });

  if (ordersWithWorkflows.length === 0) {
    console.warn("⚠️  No orders available, skipping shipping instructions");
    return;
  }

  const factories = await prisma.factory.findMany({
    select: { id: true },
    take: 5,
  });
  const addresses = await prisma.address.findMany({
    select: { id: true, customerId: true },
    take: 50,
  });
  const addressByCustomer = new Map(addresses.map((a) => [a.customerId, a.id]));

  let count = 0;
  const firstFactoryId = factories[0]?.id ?? null;

  for (const order of ordersWithWorkflows) {
    const manufacturingResult = (() => {
      let sum = 0;
      for (const wf of order.manufacturingWorkflows) {
        const lastPlan = wf.plans[0];
        sum += lastPlan?.outputSuccessQuantity ?? 0;
      }
      return sum || (order.totalQuantity ?? 0);
    })();
    if (manufacturingResult <= 0) continue;

    try {
      let customerDeliveryQty = 0;

      // NORMAL_DELIVERY for some orders: customer delivery first
      const customerId = order.orderReceipt?.customerId;
      const toAddressId =
        customerId != null ? (addressByCustomer.get(customerId) ?? null) : null;
      if (toAddressId != null && Math.random() > 0.5) {
        const existingDelivery = await prisma.shippingInstruction.findFirst({
          where: {
            orderId: order.id,
            type: "NORMAL_DELIVERY",
          },
        });
        if (!existingDelivery) {
          customerDeliveryQty = Math.min(
            Math.floor(manufacturingResult * (0.3 + Math.random() * 0.5)) || 1,
            manufacturingResult,
          );
          await prisma.shippingInstruction.create({
            data: {
              orderId: order.id,
              type: "NORMAL_DELIVERY",
              plannedQuantity: customerDeliveryQty,
              resultQuantity: null,
              fromFactoryId: firstFactoryId,
              toAddressId,
              notes: "Demo customer delivery",
            },
          });
          count++;
        }
      }

      // STOCK: remaining quantity (manufacturing result minus customer deliveries)
      const existingStock = await prisma.shippingInstruction.findFirst({
        where: { orderId: order.id, type: "STOCK" },
      });
      if (!existingStock) {
        const remaining = Math.max(
          0,
          manufacturingResult - customerDeliveryQty,
        );
        await prisma.shippingInstruction.create({
          data: {
            orderId: order.id,
            type: "STOCK",
            plannedQuantity: remaining,
            resultQuantity: null,
            fromFactoryId: null,
            toAddressId: null,
            notes: "Demo stock (remaining)",
          },
        });
        count++;
      }
    } catch (error) {
      console.error(
        `  ❌ Failed to seed shipping instruction for order ${order.id}:`,
        error,
      );
    }
  }

  console.log(`✨ Seeded ${count} shipping instructions`);
}

async function seedProcessRecords() {
  console.log("📝 Seeding process records...");

  const plans = await prisma.processPlan.findMany({
    where: {
      status: "READY",
    },
    include: {
      template: true,
    },
    take: 100, // Limit to first 100 plans
  });

  if (plans.length === 0) {
    console.warn(
      "⚠️  No READY process plans available, skipping process records",
    );
    return;
  }

  const getRandomElement = <T>(array: T[]): T =>
    array[Math.floor(Math.random() * array.length)];

  let count = 0;

  // Create records for some plans
  for (const plan of plans.slice(0, 30)) {
    if (!plan.assignedTo) continue;

    const recordType = getRandomElement<"IN_PROGRESS" | "COMPLETED">([
      "IN_PROGRESS",
      "COMPLETED",
    ]);

    const startAt = new Date();
    startAt.setHours(startAt.getHours() - Math.floor(Math.random() * 48)); // Random time in last 48 hours

    const endAt =
      recordType === "COMPLETED"
        ? new Date(
            startAt.getTime() + (Math.floor(Math.random() * 8) + 1) * 3600000,
          ) // 1-9 hours later
        : null;

    try {
      await prisma.processRecord.create({
        data: {
          planId: plan.id,
          type: recordType,
          startAt: startAt,
          endAt: endAt,
          achievedBy: plan.assignedTo,
          notes: `Work session for ${(() => {
            const name = plan.template.name as {
              ja?: string;
              en?: string;
            } | null;
            return name?.en || name?.ja || "Unknown";
          })()}`,
        },
      });
      count++;
    } catch (error) {
      console.error(
        `  ❌ Failed to seed process record for plan ${plan.id}:`,
        error,
      );
    }
  }

  console.log(`✨ Seeded ${count} process records`);
}

async function seedWorkflowLinks() {
  console.log("🔗 Seeding workflow links (split/merge DAG)...");

  // Find ORDERED orders that have at least one workflow with 3+ plans
  const ordersWithWorkflows = await prisma.order.findMany({
    where: { status: "ORDERED", isDeleted: false },
    select: {
      id: true,
      totalQuantity: true,
      manufacturingWorkflows: {
        select: {
          id: true,
          name: true,
          displayOrder: true,
          plans: {
            select: {
              id: true,
              sequence: true,
              templateId: true,
              outputSuccessQuantity: true,
            },
            orderBy: { sequence: "asc" },
          },
        },
        orderBy: { displayOrder: "asc" },
      },
    },
    take: 100,
  });

  const getRandomElement = <T>(array: T[]): T =>
    array[Math.floor(Math.random() * array.length)];

  const templates = await prisma.processTemplate.findMany({
    select: { id: true, name: true },
    orderBy: { displayOrder: "asc" },
  });
  const factories = await prisma.factory.findMany({
    select: { id: true },
    take: 10,
  });
  const employees = await prisma.employee.findMany({
    select: { username: true },
    where: { isEnabled: true },
    take: 10,
  });

  if (
    templates.length < 3 ||
    factories.length === 0 ||
    employees.length === 0
  ) {
    console.warn(
      "⚠️  Not enough templates/factories/employees, skipping workflow links",
    );
    return;
  }

  let linkCount = 0;
  let splitOrderCount = 0;
  const maxSplitOrders = 5; // Create split/merge demos for up to 5 orders

  for (const order of ordersWithWorkflows) {
    if (splitOrderCount >= maxSplitOrders) break;

    // Need a main workflow with at least 2 plans that have output quantities
    const mainWorkflow = order.manufacturingWorkflows.find(
      (wf) =>
        wf.plans.length >= 2 &&
        wf.plans.some((p) => (p.outputSuccessQuantity ?? 0) > 0),
    );
    if (!mainWorkflow) continue;

    // Find a plan to split after (one that has output, not the last plan)
    const splitCandidates = mainWorkflow.plans.filter(
      (p, i) =>
        i < mainWorkflow.plans.length - 1 &&
        (p.outputSuccessQuantity ?? 0) > 10,
    );
    if (splitCandidates.length === 0) continue;

    const splitAfterPlan = splitCandidates[0];
    const totalOutput = splitAfterPlan.outputSuccessQuantity ?? 0;
    if (totalOutput <= 0) continue;

    // Create 2 child workflows (split the quantity)
    const splitA = Math.round(totalOutput * 0.6);
    const splitB = totalOutput - splitA;
    if (splitA <= 0 || splitB <= 0) continue;

    try {
      // Child workflow A
      const childA = await prisma.manufacturingWorkflow.create({
        data: {
          orderId: order.id,
          name: `${mainWorkflow.name ?? "Main"} - Split A`,
          displayOrder: (mainWorkflow.displayOrder ?? 0) + 1,
        },
      });

      // Add 2 plans to child A
      const childATemplates = templates
        .filter((t) => !mainWorkflow.plans.some((p) => p.templateId === t.id))
        .slice(0, 2);
      if (childATemplates.length === 0) continue;

      let prevOutput = splitA;
      for (let i = 0; i < childATemplates.length; i++) {
        const successRate = 0.95 + Math.random() * 0.05;
        const output = Math.round(prevOutput * successRate);
        await prisma.processPlan.create({
          data: {
            workflowId: childA.id,
            templateId: childATemplates[i].id,
            sequence: i,
            status: "READY",
            assignedTo: getRandomElement(employees).username,
            estimatedHours: Math.floor(Math.random() * 6) + 2,
            plannedAt: new Date(),
            factoryId: getRandomElement(factories).id,
            inputQuantity: i === 0 ? splitA : prevOutput,
            outputSuccessQuantity: output,
          },
        });
        prevOutput = output;
      }

      // Child workflow B
      const childB = await prisma.manufacturingWorkflow.create({
        data: {
          orderId: order.id,
          name: `${mainWorkflow.name ?? "Main"} - Split B`,
          displayOrder: (mainWorkflow.displayOrder ?? 0) + 2,
        },
      });

      // Add 2 plans to child B (different templates if possible)
      const usedIds = new Set([
        ...mainWorkflow.plans.map((p) => p.templateId),
        ...childATemplates.map((t) => t.id),
      ]);
      const childBTemplates = templates
        .filter((t) => !usedIds.has(t.id))
        .slice(0, 2);
      const fallbackTemplates =
        childBTemplates.length >= 1 ? childBTemplates : templates.slice(0, 2);

      prevOutput = splitB;
      for (let i = 0; i < fallbackTemplates.length; i++) {
        const successRate = 0.95 + Math.random() * 0.05;
        const output = Math.round(prevOutput * successRate);
        await prisma.processPlan.create({
          data: {
            workflowId: childB.id,
            templateId: fallbackTemplates[i].id,
            sequence: i,
            status: "READY",
            assignedTo: getRandomElement(employees).username,
            estimatedHours: Math.floor(Math.random() * 6) + 2,
            plannedAt: new Date(),
            factoryId: getRandomElement(factories).id,
            inputQuantity: i === 0 ? splitB : prevOutput,
            outputSuccessQuantity: output,
          },
        });
        prevOutput = output;
      }

      // Create workflow links: main -> childA, main -> childB
      await prisma.workflowLink.create({
        data: {
          sourceWorkflowId: mainWorkflow.id,
          targetWorkflowId: childA.id,
          splitAfterPlanId: splitAfterPlan.id,
          routedQuantity: splitA,
        },
      });
      linkCount++;

      await prisma.workflowLink.create({
        data: {
          sourceWorkflowId: mainWorkflow.id,
          targetWorkflowId: childB.id,
          splitAfterPlanId: splitAfterPlan.id,
          routedQuantity: splitB,
        },
      });
      linkCount++;

      // For the first 2 orders, also create a merge target workflow
      if (splitOrderCount < 2) {
        const mergeWorkflow = await prisma.manufacturingWorkflow.create({
          data: {
            orderId: order.id,
            name: `${mainWorkflow.name ?? "Main"} - Merged QC`,
            displayOrder: (mainWorkflow.displayOrder ?? 0) + 3,
          },
        });

        // Add a final QC-like plan to the merge target
        const mergeTemplate = getRandomElement(templates);
        const mergedInput = splitA + splitB;
        await prisma.processPlan.create({
          data: {
            workflowId: mergeWorkflow.id,
            templateId: mergeTemplate.id,
            sequence: 0,
            status: "READY",
            assignedTo: getRandomElement(employees).username,
            estimatedHours: Math.floor(Math.random() * 4) + 1,
            plannedAt: new Date(),
            factoryId: getRandomElement(factories).id,
            inputQuantity: mergedInput,
            outputSuccessQuantity: Math.round(mergedInput * 0.98),
          },
        });

        // Create merge links: childA -> merge, childB -> merge
        await prisma.workflowLink.create({
          data: {
            sourceWorkflowId: childA.id,
            targetWorkflowId: mergeWorkflow.id,
            routedQuantity: splitA,
          },
        });
        linkCount++;

        await prisma.workflowLink.create({
          data: {
            sourceWorkflowId: childB.id,
            targetWorkflowId: mergeWorkflow.id,
            routedQuantity: splitB,
          },
        });
        linkCount++;
      }

      splitOrderCount++;
    } catch (error) {
      console.error(
        `  ❌ Failed to seed workflow links for order ${order.id}:`,
        error,
      );
    }
  }

  console.log(
    `✨ Seeded ${linkCount} workflow links across ${splitOrderCount} orders`,
  );
}

async function seedStockTransactions() {
  console.log("📊 Seeding stock transactions...");

  // Get existing stocks
  const stocks = await prisma.stock.findMany({
    include: {
      material: true,
    },
    take: 50, // Limit to first 50 stocks
  });

  if (stocks.length === 0) {
    console.warn("⚠️  No stocks available, skipping stock transactions");
    return;
  }

  // Get employees for transactions
  const employees = await prisma.employee.findMany({
    where: { isEnabled: true },
    take: 10,
  });

  if (employees.length === 0) {
    console.warn("⚠️  No employees available, skipping stock transactions");
    return;
  }

  // Note: CUT and MOVE transactions require linkedTransactionId and create two linked transactions
  // For seed purposes, we'll skip CUT and MOVE as they require complex logic
  const transactionTypes: Array<
    "USE" | "DAMAGED" | "DISCARD" | "DEFECTIVE" | "STOCK_TAKE" | "OVERRIDE"
  > = ["USE", "DAMAGED", "DISCARD", "DEFECTIVE", "STOCK_TAKE", "OVERRIDE"];

  const getRandomElement = <T>(array: T[]): T =>
    array[Math.floor(Math.random() * array.length)];

  let count = 0;
  const createdTransactions = [];

  // Create various types of transactions
  for (let i = 0; i < 100; i++) {
    const stock = getRandomElement(stocks);
    const employee = getRandomElement(employees);
    const transactionType = getRandomElement(transactionTypes);
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - Math.floor(Math.random() * 30)); // Random date in last 30 days
    baseDate.setHours(Math.floor(Math.random() * 24));
    baseDate.setMinutes(Math.floor(Math.random() * 60));

    const quantity = Math.floor(Math.random() * 10) + 1; // 1-10 pieces
    let quantityBefore: number;
    let quantityAfter: number;
    let direction: boolean;
    let transactionQuantity: number | null = null; // null for STOCK_TAKE and OVERRIDE

    // Always set quantityBefore and quantityAfter for all transaction types
    quantityBefore = stock.availableQuantity;

    // For STOCK_TAKE and OVERRIDE, set quantityAfter and calculate direction
    if (transactionType === "STOCK_TAKE" || transactionType === "OVERRIDE") {
      // Randomly increase or decrease
      const isIncrease = Math.random() > 0.5;
      if (isIncrease) {
        quantityAfter = quantityBefore + quantity;
      } else {
        quantityAfter = Math.max(0, quantityBefore - quantity);
      }
      direction = quantityAfter > quantityBefore;
      transactionQuantity = null; // null for STOCK_TAKE and OVERRIDE
    } else {
      // For USE, DAMAGED, DISCARD - these are decrease transactions
      quantityAfter = Math.max(0, quantityBefore - quantity);
      direction = false; // Always decrease for these types
      transactionQuantity = quantity; // Set quantity for non-STOCK_TAKE/OVERRIDE
    }

    try {
      // Include factoryId from stock
      // Note: We don't update the actual stock in seed, just create transaction records
      const transaction = await prisma.stockTransaction.create({
        data: {
          materialId: stock.materialId,
          diameter: stock.diameter,
          length: stock.length,
          polished: stock.polished,
          // customType is required - use "-" as default if stock.customType is null
          customType: stock.customType ?? "-",
          factoryId: stock.factoryId,
          transactionType,
          direction,
          quantity: transactionQuantity,
          quantityBefore,
          quantityAfter,
          employeeUsername: employee.username,
          usageLocation: transactionType === "USE" ? "Factory A" : null,
          notes:
            transactionType === "STOCK_TAKE"
              ? "Stock take adjustment"
              : transactionType === "DAMAGED"
                ? "Material damaged during handling"
                : transactionType === "DISCARD"
                  ? "Material discarded due to quality issues"
                  : transactionType === "DEFECTIVE"
                    ? "Defective item from purchase, cannot be used"
                    : null,
          createdAt: baseDate,
        },
      });

      createdTransactions.push(transaction);
      count++;
    } catch (error) {
      console.error(`  ❌ Failed to seed stock transaction ${i + 1}:`, error);
    }
  }

  console.log(`✨ Seeded ${count} stock transactions`);
}

async function main() {
  console.log("🌱 Starting seed...");

  // Load dev users from JSON file
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const workspaceRoot = join(__dirname, "../../..");
  const devUsersPath = join(workspaceRoot, "_credentials", "dev-users.json");
  const devUsersData = JSON.parse(
    readFileSync(devUsersPath, "utf-8"),
  ) as DevUsersData;

  console.log(`📋 Found ${devUsersData.users.length} users to seed`);

  // Create or update employees
  const employees = [];
  for (const user of devUsersData.users) {
    const username = user.credential;
    const displayName = user.name || username;

    try {
      const employee = await prisma.employee.upsert({
        where: { username },
        update: {
          displayName,
          avatarImage: user.image,
          // Keep existing values for other fields if updating
        },
        create: {
          username,
          displayName,
          email: null,
          department: null,
          title: null,
          manager: null,
          avatarImage: user.image,
          employeeCode: user.employeeCode ?? 0,
          isEnabled: true,
          maxQrCodes: 1,
          maxConcurrentDevices: 3,
        },
      });

      employees.push(employee);
      console.log(`✅ ${employee.username} (${employee.displayName})`);
    } catch (error) {
      console.error(`❌ Failed to seed ${username}:`, error);
    }
  }

  // Seed permissions from CSV (if file exists)
  let permissions: Awaited<ReturnType<typeof seedPermissions>> = [];
  try {
    permissions = await seedPermissions();
  } catch {
    console.warn("⚠️  Permissions CSV not found, skipping permission seeding");
    console.warn(
      "   To seed permissions, ensure permissions.csv exists in shared/prisma/",
    );
  }

  // Seed groups
  const groups = await seedGroups();

  // Seed group permissions
  await seedGroupPermissions(groups, permissions);

  // Seed employee group memberships
  await seedEmployeeGroups(employees, groups);

  // Seed employee zones (assign all to JPN)
  await seedEmployeeZones(employees);

  // Seed access cards
  await seedAccessCards(employees);

  // Seed materials
  const materials = await seedMaterials();

  // Seed factories first (required for stock and machines)
  await seedFactories();

  // Seed machines (設備) - requires factories
  const machines = await seedMachines();

  // Seed suppliers
  const suppliers = await seedSuppliers();

  // Seed stock purchases (creates Stock entries automatically)
  // Pass employees array so purchase items can have required employeeUsername field
  await seedStockPurchases(suppliers, materials, employees);

  // Seed order items (products)
  const products = await seedProducts(materials);

  // Seed machine programs and inspection programs for first product (demo)
  await seedMachineAndInspectionPrograms(products, machines);

  // Seed companies then customers (branches) for demo
  await seedCompanies();
  await seedCustomers();
  await seedAddresses();
  await seedPriceLists();

  // Seed demo orders
  const orders = await seedOrders();

  // Seed process templates
  await seedProcessTemplates();

  // Seed process plans (use orders if available)
  await seedProcessPlans(orders);

  // Seed workflow links (split/merge DAG demo data)
  await seedWorkflowLinks();

  // Seed shipping instructions (delivery workflows: plannedQuantity/resultQuantity only)
  await seedShippingInstructions();

  // Seed process records
  await seedProcessRecords();

  // Seed stock transactions
  await seedStockTransactions();

  console.log("✨ Seed completed!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
