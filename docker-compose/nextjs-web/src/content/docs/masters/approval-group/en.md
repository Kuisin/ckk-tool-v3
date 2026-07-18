# Approval Group — User Manual

Operation code **MS0A**. Registers and manages groups of people who perform approvals. Approvals for work orders, material purchases, and the like are done by the members of these groups.

## What you can do here

Manage "who can approve" as groups. Create a group per approval stage (first, second, etc.) and register its members.

- A group has a **type** that determines its approval role.
- Register **members** (people who can approve) into a group.
- To cover for an absent approver, you can set up a **delegate** for a fixed period.

## Types

There are three group types. You choose one at creation and cannot change it later.

- **First approval** — the first approval, such as a production decision.
- **Second approval** — the second-stage approval, such as a department sign-off.
- **Workflow change approval** — a dedicated group that approves changes to the manufacturing workflow.

## Viewing the list

- The list shows registered groups. Click a row to open its detail screen.
- You can filter by type and status (active / inactive).

## Creating a new group

Register from **New** at the top right of the list.

- **Type** — choose from the three above (cannot be changed after creation).
- **Name** (Japanese required, English optional).
- **Active** — turn off to stop it from being used.

## Detail screen

The detail screen is split into tabs.

- **Group info** — check the name and type.
- **Members** — the list of people who can approve. Use "Add member" to search by name or username and add. Each member can be toggled **active / inactive** or **removed**.
- **Delegates** — manage fixed-period delegates (see below).
- **History** — the record of changes.

Use the menu at the top right to **Edit** / **Deactivate** / **Delete**.

## Delegates

When the assigned approver is absent, this lets another person temporarily take over approvals. Register from "Add delegate".

- **Original approver** — the intended approver (chosen from the group's active members).
- **Delegate** — the person who approves in their place.
- **Start date / End date** — the period the delegation is valid.
- **Reason** — optional.

Once the period passes, the delegation automatically stops applying.

## Glossary

- **Approval** — confirming the content and agreeing that it may proceed.
- **First / second approval** — the approval stages. Once first passes, it moves to second.
- **Member** — a person who can approve in that group.
- **Delegate** — a person who approves in place of an absent approver for a set period.

If you are new, please also see the [Start Manual](/docs/start).
