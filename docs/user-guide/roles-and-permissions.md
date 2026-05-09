# Roles and permissions

There are three roles: **Admin**, **Office**, and **Warehouse**. Roles
are set when an admin creates the user and changed inline from the Users
page later.

## At a glance

| Capability                  | Admin | Office | Warehouse |
|-----------------------------|:-----:|:------:|:---------:|
| Sign in                     |   ✅  |   ✅   |    ✅     |
| Catalog (mobile intake)     |   ✅  |   ✅   |    ✅     |
| Inventory — view all lots   |   ✅  |   ✅   |    ✅     |
| Inventory — edit fields     |   ✅  |   ✅   |    ✅\*   |
| Inventory — bulk actions    |   ✅  |   ✅\* |    —      |
| Lot detail — change state   |   ✅  |   ✅   |    —      |
| Lot detail — move to a job  |   ✅  |   ✅   |    ✅\*   |
| Lot detail — delete         |   ✅  |   —    |    —      |
| Lot detail — Run AI now     |   ✅  |   ✅   |    ✅     |
| Customers + Jobs — view     |   ✅  |   ✅   |    —      |
| Customers + Jobs — edit     |   ✅  |   ✅   |    —      |
| Export to AF360 / HiBid     |   ✅  |   ✅   |    —      |
| Settings + Users            |   ✅  |   —    |    —      |

\* Warehouse can edit and move their own lot while it's in progress in
catalog. They don't see bulk affordances on inventory.
\* Office can do every bulk action except delete — that's admin only.

## What each role lands on after sign-in

| Role      | Lands on    |
|-----------|-------------|
| Admin     | `/inventory` |
| Office    | `/inventory` |
| Warehouse | `/catalog`   |

The sidebar reflects what the role can reach. See
[Getting started](./getting-started.md) for the per-role sidebar
screenshots.

## Catalog

All three roles can use the catalog flow. Warehouse is the primary
persona — phones and tablets — but Admin/Office can pick it up too if
they want to catalog a lot themselves.

## Inventory

Everyone sees every lot. The difference is what the row checkboxes do:

- **Admin** — full bulk: change state, move, reset AI, delete.
- **Office** — same minus delete.
- **Warehouse** — no bulk. Rows aren't selectable.

Search, filter, and sort behave the same for everyone.

## Lot detail

Editing a lot's fields (Title, Description, Price, etc.) works for
everyone. The differences:

- **State change** is hidden from Warehouse. Admin/Office see the state
  menu and can move lots through the lifecycle.
- **Delete** is admin only. Office and Warehouse don't see the button.
- **Move / Assign to Job** — admin and office anywhere; warehouse only
  on the active in-progress lot in their own catalog session.
- **Run AI now** is available to all three roles when there's something
  for AI to fill.

## Customers and Jobs

Admin and Office can browse, search, edit, disable, and create.
Warehouse doesn't see Customers in the sidebar at all — they pick a
customer/job at the start of a catalog session and that's the extent
of their interaction.

## Export to AF360 / HiBid

Admin and Office can trigger an export from a job's page or from the
Inventory-level Export button when a job filter is active. Warehouse
doesn't see the button.

## Settings

Admin only. The page covers AI Schedule, Auction Platforms (read-only),
and Users. Office and Warehouse don't see Settings in the sidebar.
