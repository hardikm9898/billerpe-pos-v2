# BillerPe POS Pro

Build the BillerPe V2 frontend prototype using the attached BillerPe Markdown files as the functional/product specification.

IMPORTANT: This is a DESIGN + IMPLEMENTATION task.

SOURCE PRIORITY

Use the attached files as the authoritative functional specification, especially:

BILLERPE-V2-LOVABLE-FINAL-HANDOFF.md — master scope/behavior

BILLERPE-V2-PO-UI-DECISIONS.md — confirmed business decisions

BILLERPE-V2-LOVABLE-SCREEN-MATRIX.md — screen/route/component inventory

BILLERPE-V2-LOVABLE-MOCK-DATA.md — mock data

BILLERPE-V2-LOVABLE-FINAL-APPROVAL.md

BILLERPE-V2-LOVABLE-FINAL-CHECK.md

BILLERPE-V2-LOVABLE-REVIEW.md

Wireframe:
https://claude.ai/code/artifact/51381692-0685-4e82-8ed5-4a7c8c3dbf54

CRITICAL DESIGN RULE

The wireframe is a REFERENCE FOR FUNCTIONALITY, INFORMATION ARCHITECTURE, states and workflows only.

DO NOT COPY ITS VISUAL DESIGN.

Do NOT reproduce its basic/old-looking layout, spacing, cards, typography, navigation styling or visual treatment.

Use your strongest modern SaaS/POS product-design capability to create a significantly more attractive, premium, polished and production-quality BillerPe UI while preserving the approved functionality.

Think: modern restaurant POS + premium SaaS dashboard + fast operational interface.

DESIGN DIRECTION

Create one coherent design system across the entire application.

Priorities:

premium but practical

extremely clear hierarchy

fast for restaurant staff

information-dense without feeling cluttered

modern cards and surfaces

excellent whitespace

strong typography

polished tables and filters

attractive dashboard analytics

intuitive navigation

clear status visualization

excellent empty/loading/error states

subtle micro-interactions

responsive desktop/tablet/mobile behavior

accessibility-conscious contrast and focus states

Use modern UI patterns where they improve UX:

refined sidebar/navigation

compact top header

contextual page headers

KPI cards

data visualization

modern table/card hybrids

drawers/sheets/modals

command/search patterns where appropriate

status badges

segmented controls

tabs

tooltips

confirmation dialogs

toast feedback

skeleton loading

empty states

subtle hover/press/entrance animations

Avoid excessive gradients, excessive glassmorphism, oversized decorative elements, unnecessary animation and anything that slows restaurant workflows.

Keep the product primarily light-theme and professional.

Use a restrained BillerPe brand palette derived from the approved specification, with the brand red as the primary action color, but improve the overall visual hierarchy rather than mechanically copying the wireframe CSS.

Use Lucide icons consistently.

Use Framer Motion only for purposeful micro-interactions and transitions.

FUNCTIONALITY

Implement the approved BillerPe V2 scope from the documents.

There are 29 approved screens/routes/workflows. Preserve their functional intent and interactions.

Important confirmed functionality includes:

Login: Password / OTP / PIN

Device registration

Forgot password

Table Grid

Dine-In

Take Away

Order & Cart

KOT

Merge Table

Transfer Table

Billing

Split Payment

Orders

Menu management

Variants

Addons

Table management

Users and permissions

7 MVP roles

Reports

Expenses

Inventory

Recipes

Semi-finished items

Purchases

Reservations

Opening & Closing / Cash Session

Offline states

Local Server

Device Management

Sync Center

Audit Log

Notifications

Printer Settings

Delivery/Packaging Charge

Approval Matrix

Dashboard

Profile / Support / Help

Preserve all confirmed business rules from the PO decisions.

Especially do not change:

Merge Table behavior

Transfer Table behavior

Split Table rejection

Split Bill = Split Payment only

offline-state behavior

3-day default maximum offline duration

reservation rules

cash-session rules

Approval Matrix being Discount-only

7-role MVP structure

Phase 2/Future exclusions

MOCK DATA

Create a centralized mock-data/service layer.

Do NOT hardcode unrelated sample values directly inside individual components.

Use realistic BillerPe restaurant data based on the attached Mock Data specification.

Restaurant:
BillerPe Demo Restaurant
Indian cuisine
Gujarati/Punjabi/North-Indian leaning
Currency: INR ₹
Date: DD/MM/YYYY

Seed realistic data for:

users

all 7 roles

tables

table states

menu categories

menu items

variants

addons

orders

KOTs

bills

payments

reservations

inventory

recipes

semi-finished items

suppliers

purchase orders

expenses

cash sessions

devices

printers

sync queue

notifications

audit logs

reports

Do not make the application look like a generic template with 3–4 fake records.

Use enough connected mock data that dashboards, tables, reports and detail pages feel alive.

Create realistic relationships between the data.

Example:
order → table → customer → KOT → bill → payment

and:

menu item → variant/addon → order line

and:

purchase → inventory → closing stock/report.

The approved mock-data specification already contains the required data density and examples. Follow it rather than inventing an unrelated dataset.

MOCK SERVICE ARCHITECTURE

Frontend only.

No real backend.
No real database.
No real API.
No payment gateway.
No real printer/hardware integration.
No production authentication.

Create clean mock services/state management so UI actions behave realistically.

Examples:

creating an order updates table state

Generate KOT changes KOT state

settling a bill updates payment/order/table state

Merge Table combines the mock orders correctly

Transfer Table moves/combines according to approved rules

notifications can become read

sync actions update mock sync states

dashboard numbers derive from mock data

reports derive from the same mock data

cash session totals update from transactions

DESIGN THE WHOLE SYSTEM, NOT INDIVIDUAL PAGES

First establish reusable:

App shell

sidebar

header

page header

buttons

inputs

selects

dropdowns

cards

KPI cards

tables

badges

tabs

modals

drawers

sheets

toast

confirmation dialogs

empty states

loading states

error states

status indicators

charts

form sections

Then use those consistently across all screens.

Avoid creating each page as an unrelated design.

RESPONSIVE UX

Design responsive behavior from the beginning.

Desktop:

optimized for POS/office monitors

Tablet:

especially important for KDS and operational workflows

Mobile:

usable for supporting/admin screens

tables become cards where appropriate

cart can become a bottom sheet

filters become drawers/sheets

navigation becomes compact/mobile navigation

Do not simply shrink desktop layouts.

DASHBOARD

Make the dashboard especially polished.

It should feel like a real modern restaurant management product.

Use:

attractive KPI cards

sales trend visualization

order volume

payment breakdown

inventory alerts

operational summary

recent orders/activity

useful quick actions

Do not invent business metrics that conflict with the specification.

TABLE GRID

Make Table Grid visually excellent and operationally fast.

Use:

clear table cards

strong status hierarchy

category navigation

search/filter

guest/order information

quick actions

reservation visibility

merge/transfer actions

The user should understand table status immediately.

ORDER & CART

Prioritize speed.

Use a modern POS layout:

category navigation

searchable menu

attractive item cards

clear pricing

fast quantity controls

sticky cart

KOT rounds

variants/addons

discount

customer information

Merge Table

Transfer Table

billing actions

Do not sacrifice usability for decoration.

KDS

Optimize for kitchen visibility:

large readable KOT cards

strong state/status hierarchy

elapsed time visibility

station organization

fast action buttons

minimal unnecessary UI

MANAGEMENT SCREENS

For Menu, Users, Inventory, Purchases, Expenses, Reports, Reservations and Settings:

Prefer modern SaaS management patterns instead of plain old-fashioned CRUD screens.

Use:

page summary

search

filters

meaningful stats where useful

clean data tables

responsive card fallback

contextual actions

polished forms

side panels/drawers where appropriate

OFFLINE EXPERIENCE

Offline is a core product differentiator.

Make the connection status highly visible but not distracting.

Support all documented connection states and the Local Server Unavailable modal.

The UI should communicate:

online

offline

syncing

sync error

conflict

local server unavailable

offline duration exceeded

Follow the documented behavior exactly.

ANIMATION

Use subtle Framer Motion animation:

page entrance

card entrance

modal/drawer transitions

button feedback

state changes

list updates

toast appearance

Keep animation fast and professional.

Restaurant staff must never feel slowed down by animation.

PERFORMANCE

Keep the implementation efficient.

Prefer:

reusable components

centralized mock data

derived state

shared utilities

lazy-loaded screens where useful

no unnecessary dependencies

no duplicated mock datasets

no unnecessary re-renders

IMPORTANT EXCLUSIONS

Do NOT build:

Split Table

Wallet

Gift Card

Owner Mobile App

Multi Outlet

Central Kitchen

Purchase Approval Workflow

QR Ordering

Loyalty

Membership

AI features

separate Waiter role

unrelated Phase 2 features

Do not turn deferred features into working functionality.

The final handoff explicitly defines these exclusions.

OPEN DECISIONS

Do not silently invent business rules for:

Stock Adjustment

Negative Stock Policy

Settled-bill edit approval step

These are explicitly unresolved in the source documentation. Use the most conservative clearly-labelled UI treatment if those screens require a placeholder.

IMPLEMENTATION ORDER

Use this order internally:

Establish design system + app shell

Create centralized mock data + mock services

Build navigation/routing

Build core operational screens

Build management screens

Build reports/dashboard

Implement cross-screen state synchronization

Add responsive behavior

Add animation/micro-interactions

Accessibility/performance polish

Final consistency/QA pass

Do not stop after creating only the shell or a few representative screens.

FINAL QUALITY BAR

The result should feel like a professionally designed commercial POS SaaS product, not an AI-generated CRUD dashboard.

Before considering the task complete, verify:

all approved screens exist

routes work

major buttons perform meaningful mock actions

mock data is connected

state changes propagate across screens

Merge/Transfer rules work

billing/settlement works

offline states work

responsive layouts work

no dead obvious buttons

no unrelated features were added

no wireframe visual cloning occurred

consistent design system across the entire product

polished typography, spacing, hierarchy and interaction states

realistic restaurant data throughout

MOST IMPORTANT:

Use the Markdown files for WHAT the product does.

Use the wireframe for HOW the workflows function.

Use your own strongest product-design judgment for HOW THE FINAL UI SHOULD LOOK.

Do not ask me to manually redesign each screen.
Do not wait for individual screen-by-screen design approval.
Create the complete cohesive BillerPe V2 experience in one implementation pass.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/521c6095-cf5d-47a6-9f8f-0c031b753140).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
