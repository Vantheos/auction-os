# AF360 → HiBid Lot Import: CSV Specification & Pre-Configuration Guide

**Scope:** Auction Flex 360 (AF360) — the cloud-based auction management platform through which all lot data is uploaded to HiBid.com
**Purpose:** Complete technical reference for building a batch lot import module targeting AF360's CSV import function
**Sources:** Auction Flex 360 official help docs (help.auctionflex360.com, help-auctionflex.azurewebsites.net), AuctionWriter integration guides (validated against current AF360 UI, May 2026)

---

## Architecture Context

HiBid has no public API for direct lot ingestion. All lot data must enter through AF360. The pipeline is:

```
Your Software → CSV File → AF360 Lot Import → AF360 → HiBid.com
```

The CSV import is found at:
**Pre-Auction → Lots → Import Lots**

AF360 will remember field mapping settings after the first successful import. Subsequent imports using the same column structure require no re-mapping.

---

## Pre-Configuration Requirements

These must be completed in AF360 **before** the CSV import will succeed. Your import module should validate or surface each of these as user-facing setup steps.

### 1. Auction Must Exist

An auction record must be created in AF360 before lots can be imported into it.

**Path:** Auctions → New Auction
**Required fields at auction creation:**
- Auction Type: select `HiBid` for internet-only or webcast auctions
- Name (required — unique and descriptive)
- Start and end dates
- Description (required for HiBid uploads)

**Note:** If you import lots without linking to an existing auction, they go into general inventory, not an active auction.

### 2. Sellers / Consignors Must Be Pre-Created

Every lot requires a `SellerCode`. AF360 will skip any lot whose SellerCode does not match an existing customer record. A skipped lot misaligns all subsequent lot-to-image associations — the entire import must be deleted and restarted if this occurs.

**Path to find/create seller codes:** Customers → Customer List → Customer Code (displayed in the `CustCode` field)

**Seller code format:** A system-generated alphanumeric code (combination of letters and numbers). Do not use the customer's first and last name — this will not match.

**Best practice:** Create all consignor profiles in AF360 **before** generating or exporting your catalog. Collect and store the `CustCode` values for use in the CSV.

**Fallback Consignor ID:** Configure a fallback consignor ID during the import (Step 3 of the import wizard). Even when individual seller codes are assigned per row, a fallback ensures no lot is dropped due to a missing or mismatched code.

### 3. New Lot Defaults / Formulas

Buyer's Premium, commission, and tax formulas must be created in AF360 and assigned in the auction's **New Lot Defaults** section before lots are added. These apply automatically to all imported lots.

**Path:** Pre-Auction → Details → New Lot Defaults

If these are not pre-configured, imported lots will have no fee structure attached.

### 4. Shipping Configuration (Conditional)

If the `Shippable` CSV field will be used, the auction must be set to **"Shipping Determined by Lot"** under Auction Details before import. If this is not set, the `Shippable` field is ignored.

---

## CSV File Specification

### File Format

| Property | Requirement |
|---|---|
| Format | CSV — Comma Separated Values |
| Extension | `.csv` |
| Encoding | UTF-8 |
| Delimiter | Comma (`,`) |
| Header row | Required — Row 1 must contain column headers |
| Data start row | Row 2 |
| Cell text format | All columns should be formatted as **Text** before data entry (prevents Excel auto-formatting from corrupting lot numbers or currency values) |
| Line breaks in cells | **Not permitted.** Any cell containing a newline character will cause import errors or truncated descriptions. |
| Wrapped text | **Not permitted.** Disable text wrapping in Excel before saving. |
| File save method | Excel: File → Save As → CSV (Comma delimited) `*.csv`. Do **not** save as `.xlsx` or any other format — these will fail. |

---

### CSV Column Reference

AF360 uses a field mapping UI (File Header → DB Column) during import. Your column header names will be matched to AF360's internal DB column names via the import wizard. The names below are the exact AF360 DB Column labels to map against.

#### Core Lot Fields

| DB Column (AF360) | Suggested CSV Header | Required | Data Type | Notes |
|---|---|---|---|---|
| `Lot Number` | `LotNumber` | Yes (for auction import) | Integer | Unique per auction. Sequential strongly recommended. If omitted, lots import to general inventory only. |
| `Title` | `Title` | Yes | String | **Hard limit: 50 characters.** AF360 auto-truncates at import — no error is thrown. Titles exceeding 50 chars are silently cut. Target ≤45 chars to be safe. |
| `Description` | `Description` | Yes (for HiBid) | String, plain text | Full item description. No embedded line breaks or newline characters. No HTML. |
| `Quantity` | `Quantity` | Recommended | Integer | Number of units in the lot. Defaults to 1 if omitted. Required if using "Times the Money" bidding or "Apply Increments by Each." |
| `SellerCode` | `SellerCode` | Yes | String | Must match an existing `CustCode` in AF360's Customer List exactly. Case-sensitive match. Lots with unmatched codes are skipped silently. |
| `Start Bid` | `StartBid` | Recommended | Decimal (currency) | Opening bid displayed on HiBid. If omitted, defaults to the auction's Min Bid Amount set in Upload Settings. |

#### Estimate Fields (Optional)

| DB Column (AF360) | Suggested CSV Header | Required | Data Type | Notes |
|---|---|---|---|---|
| `PresaleEstimateMinEach` | `LowEstimate` | No | Decimal | Low end of pre-sale estimate range. Displayed to bidders on HiBid. |
| `PresaleEstimateMaxEach` | `HighEstimate` | No | Decimal | High end of pre-sale estimate range. |

Map both estimate columns to `No Mapping` in the field mapping step to exclude them from import.

#### Reserve Field (Optional)

| DB Column (AF360) | Suggested CSV Header | Required | Data Type | Notes |
|---|---|---|---|---|
| `Reserve` | `Reserve` | No | Decimal | Minimum price seller will accept. Hidden from bidders on HiBid — only "Reserve Met" / "Reserve Not Met" status is shown publicly, and only if "Show Reserve Status" is enabled in Upload Settings. |

#### Shipping Field (Conditional)

| DB Column (AF360) | Suggested CSV Header | Required | Data Type | Notes |
|---|---|---|---|---|
| `Shippable` | `Shippable` | No | Boolean | Accepted values: `true`, `false`, `T`, `F`. **Only applicable if auction is set to "Shipping Determined by Lot."** Ignored otherwise. |

---

### Minimum Required CSV (for HiBid-bound internet auction)

```
LotNumber,Title,Description,Quantity,SellerCode
1,Vintage Oak Dining Table,Solid oak table circa 1940s. Seats 8. Minor surface scratches.,1,SMTH001
2,Set of 6 Matching Chairs,Upholstered dining chairs matching lot 1. All structurally sound.,6,SMTH001
3,Victorian Writing Desk,Mahogany with brass hardware. Original finish. Three drawers.,1,JONE004
```

### Full-Featured CSV (all optional fields included)

```
LotNumber,Title,Description,Quantity,SellerCode,StartBid,LowEstimate,HighEstimate,Reserve,Shippable
1,Vintage Oak Dining Table,Solid oak table circa 1940s. Seats 8. Minor surface scratches.,1,SMTH001,50.00,400.00,600.00,300.00,false
2,Set of 6 Matching Chairs,Upholstered dining chairs matching lot 1. All structurally sound.,6,SMTH001,25.00,150.00,250.00,,false
3,Victorian Writing Desk,Mahogany with brass hardware. Original finish. Three drawers.,1,JONE004,75.00,500.00,800.00,400.00,true
```

---

## Field Mapping (Import Wizard — Step 2)

AF360's import wizard presents two columns:
- **File Header** — the column headers it reads from your CSV
- **DB Column** — the AF360 field to map each header to

The mapping is persistent. AF360 saves the last-used mapping and offers a **"Use Last Import Mapping"** option on subsequent imports.

### Recommended Mappings

| File Header (your CSV) | → DB Column (AF360) |
|---|---|
| `LotNumber` | `Lot Number` |
| `Title` | `Title` |
| `Description` | `Description` |
| `Quantity` | `Quantity` |
| `SellerCode` | `SellerCode` |
| `StartBid` | `Start Bid` |
| `LowEstimate` | `PresaleEstimateMinEach` |
| `HighEstimate` | `PresaleEstimateMaxEach` |
| `Reserve` | `Reserve` |
| `Shippable` | `Shippable` |

For any column you want to exclude: map it to **`No Mapping`** (not blank — actively select No Mapping).

---

## Import Options (Wizard — Step 3)

| Option | Recommended Setting | Notes |
|---|---|---|
| Start from Row | `2` | Skips the header row. **Always set this.** |
| Overwrite existing lots | `Unchecked` (default) | Check only when intentionally replacing existing lot data. |
| Fallback Consignor ID | Set to a valid CustCode | Catches any lots missing or mismatching SellerCode. Required to prevent silent skips. |
| Combine Descriptions | `Unchecked` | Legacy AF (desktop) used multiple description fields (Desc 1–5). AF360 uses a single Description field. Leave unchecked. |

---

## Import Summary — What to Expect

After import, AF360 displays a summary:

| Field | Meaning |
|---|---|
| Rows Processed | Total rows read from the CSV |
| Successes | Rows imported without issue |
| Duplicates | Rows skipped because the lot number already exists (and overwrite is off) |
| Warnings | Rows with non-fatal issues (e.g., consignor code mismatch — lot was skipped) |
| Errors | Rows with structural problems — review line numbers in the error detail |

**Critical:** If any lots are skipped due to consignor code mismatch, all subsequent lots may be misaligned with their images. The safest recovery is to delete all lots in the auction and re-import from scratch after correcting the source data.

---

## Image Import Specification

Images are imported separately from lot data. Lots must exist in AF360 before images can be associated.

### File Format

| Property | Requirement |
|---|---|
| Accepted formats | `.jpg`, `.jpeg`, `.png` only |
| HEIC/HEIF | Not supported — convert before import |
| ZIP upload | Not supported — upload image files directly |
| Naming convention | Filename must encode the lot number (see below) |

### Image Naming Convention

AF360 uses the filename to auto-assign images to lots.

| Scenario | Filename Format | Example |
|---|---|---|
| Single image, lot 1 | `{LotNumber}.jpg` | `1.jpg` |
| Multiple images, lot 1 | `{LotNumber}-{Order}.jpg` | `1-1.jpg`, `1-2.jpg`, `1-3.jpg` |
| Multiple images, lot 12 | `{LotNumber}-{Order}.jpg` | `12-1.jpg`, `12-2.jpg` |

**Accepted separator characters between lot number and sequence number:**
- Hyphen: `1-1.jpg` ✓
- Period: `1.1.jpg` ✓
- Underscore: `1_1.jpg` ✓

**Display order** is determined by the sequence number (the digit after the separator). Lower number = displayed first.

### Image Import Path in AF360

**Pre-Auction → Lots → Lot Images → Select Lot Images**

1. Click **Select Lot Images**
2. Navigate to your image folder
3. Select all images (`Ctrl+A` on Windows, `Cmd+A` on Mac)
4. Click **Open**
5. Check **Skip Duplicates** in the upper right (prevents re-importing existing images)
6. Click **Upload**

**Important:** You can upload the auction to HiBid while image import is in progress. However, only images that have completed uploading at the moment you click **Upload Auction** will be included in the HiBid listing. Re-upload the auction after image import completes if needed.

---

## Post-Import: Uploading to HiBid

Once lots and images are in AF360, uploading to HiBid is a separate manual step.

**Path:** Dashboard → Upload Auction to HiBid (or Pre-Auction → Details → Upload Settings)

### Upload Settings Checklist

| Setting | Notes |
|---|---|
| Auction Dates/Times | Bidding open/close. Entered in **Eastern Time** regardless of your timezone. Incorrect dates cause auctions to archive immediately. |
| Preview Dates/Times | When physical preview is available |
| Checkout Dates/Times | When payment/pickup occurs |
| Bidding Type | Internet Only (most common), Webcast, Absentee |
| Bid Registration Type | Authentication (CC required, token retained), Verification (CC validated, not retained), Contact Info Only, No Registration |
| Min Bid Amount | Default starting bid — can be overridden per lot via `StartBid` in the CSV |
| Bid Increments | Set before upload. Can be copied from a previous auction. |
| Lot Stagger | Seconds between sequential lot close times. At 10 seconds with 100 lots, last lot closes 1,000 seconds after first. |
| Soft Close | Seconds — extends a lot's close time if a bid is placed within this window (prevents sniping) |
| Show Reserve Status | Show "Reserve Met / Not Met" on HiBid. Does not reveal the reserve amount. |
| Times the Money | If a lot has Quantity > 1, final price = bid × quantity |
| Apply Increments by Each | If selling quantities, bid increment is multiplied by quantity |
| Maximum Bid Permission | Default bid limit per bidder per item. Most set to $9,999,999.99. |
| HiBid Starting Bid Card Number | For webcast auctions with live floor bidders — set online bidder numbers to start at a range that doesn't conflict (default: 7000). |

**Do not** check "Upload Prices Realized" until the auction is fully complete and all lots are invoiced. Doing so early shows incorrect pricing on HiBid.

---

## Known Constraints & Gotchas for Code

| Constraint | Impact |
|---|---|
| Title max 50 chars | Titles are silently truncated — no error thrown. Enforce ≤50 chars (recommend ≤45 as buffer) in your module before export. |
| No line breaks in Description | Cells with `\n` or `\r\n` cause malformed imports. Strip all newlines from description text before writing to CSV. |
| SellerCode must pre-exist | A missing match silently skips the lot — no error row. One skipped lot misaligns all subsequent image associations. |
| Fallback consignor required | Even if all rows have SellerCodes, always set a fallback in the import wizard to catch edge cases. Expose this as a required config field in your module. |
| All columns must be Text format | Numbers entered as Excel numeric type can drop leading zeros, add decimals, or auto-convert lot numbers. Force Text format on all columns. |
| Overwrite is off by default | Re-importing without overwrite creates duplicates. Your module should surface this as an explicit toggle — default to off. |
| Header row always Row 1 | Always include headers. Always set "Start from Row 2" in the import wizard. |
| Images import separately | Your module must handle lot CSV and image files as two distinct outputs — they are imported through different UI paths. |
| Image import blocks HiBid upload | Only images uploaded before the HiBid upload click are published. Communicate this dependency clearly. |
| Auction must exist first | Your module cannot create the auction. It must reference an existing AF360 auction. Consider a config step where the user selects or confirms the target auction. |
| AF remembers last mapping | After first import, AF360 auto-suggests mappings. Use consistent column header names across all exports from your module to leverage this. |

---

## Quick Reference: CSV Template

Copy this header row exactly for a full-featured import:

```
LotNumber,Title,Description,Quantity,SellerCode,StartBid,LowEstimate,HighEstimate,Reserve,Shippable
```

Minimum viable header row (for basic auction import):

```
LotNumber,Title,Description,SellerCode
```

---

## Support Contact

Auction Flex support (for AF360 / HiBid questions):
- **Phone:** 833-217-5519
- **Help Center:** help.auctionflex360.com
- **Legacy docs:** help-auctionflex.azurewebsites.net
