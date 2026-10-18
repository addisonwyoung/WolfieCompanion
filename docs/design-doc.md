# Wolfie Companion Design Document
## Technology Stack and Reasoning
* **Frontend:**
    * **React:** Provides reusable UI components and efficient rendering, making it easier to build and manage many different screens. 
    * **Vite:** Provides a fast development environment and optimized build process for React frontend.
    * **TypeScript:** Provides static type checking and explicit data structures, making the codebase easier for both developers and AI coding agents to understand and maintain. 

* **Backend:**
    * **Node.js:** Enables TypeScript to run on the server, allowing for a consistent language across the frontend and backend while efficiently handling multiple API requests.
    * **Express:** Simplifies the creation of RESTful APIs and organization of middleware and routing between the client and server.
    * **Socket.IO:** Enables real-time communication between the frontend and backend, supporting messaging and live updates without requiring users to refresh the page. 

* **Database:**
    * **PostgreSQL:** Useful for managing relational data, as our application contains relationships between users, courses, connections, messages, assignments, and study spaces. 
    * **Prisma ORM:** Provides type-safe database queries and simplifies CRUD operations compared with writing raw SQL.

* **Firebase Authentication:** Provides reliable authentication services, making it easier to verify Stony Brook email addresses while securely storing user authentication data. 

* **External Services:**
    * **Firebase Storage:** Securely stores and retrieves files uploaded by users and works well with Firebase Authentication. 
    * **Resend:** Used for assignment reminders and application notifications.
    * **Mapbox:** Provides customizable, interactive maps that can display campus study spaces and can be easily incorporated into React components. 
    * **Google Cloud Vision API:** Uses OCR to extract text from uploaded schedule screenshots, allowing the application to easily process students’ course information. 

## Connections to Requirements
| Requirement | Our Design Connection | 
| --- | --- |
| Student verification | Firebase Authentication verifies SBU email accounts before users access student feautres | 
| Schedule image upload course retrieval | Firebase Storage stores uploaded schedules | 
| Course retrieval | Google Vision API extracts course information for processing by backend | 
| Classmate recommendations | PostgreSQL stores course, major, and interest data that the backend then uses to generate classmate recommendations |
| Messaging & group chats | Socket.IO supports real-time communication, while PostgreSQL provides persistent conversation storage |
| Availability & group scheduling | Schedule and availability data stored in PostgreSQL can be compared by backend logic to identify overlapping meeting times | 
| Study-space crowd reporting | Mapbox displays campus study locations, and PostgreSQL stores reports, while Socket.IO provides live crowd-level updates |
| Assignment reminders | Assignment/deadline data is stored in PostgreSQL and Resend will deliver reminder notifcations | 
| Anonymous course evaluations | PostgreSQL stores course evaluations, while backend authorization controls access and maintains anonymity | 

## How Will AI Be Used Throughout the Project
We are using Codex with OpenSpec to help develop the project in a structured way. Instead of simply asking AI to generate code, OpenSpec lets our team first define the requirements, design, and implementation tasks for each feature and generate a proposal that we can review and agree on, ensuring the implementation aligns with our project goals. Codex, an AI coding agent, then uses those specifications when implementing and testing the feature.

## Continuous Integration (CI)
We use GitHub Actions to automatically check our code before changes are merged into the main branch. Our CI pipeline runs checks for both the client and server, helping us catch build or code-quality problems introduced by new changes. This ensures that new changes do not break any existing functionality.

## API Requests 
API requests allow our React frontend to communicate with our Express backend. The Express server receives the request, processes or validates the data, and sends a JSON response back to the frontend. 

## Non-Persistent
For our current prototype, data is stored in memory rather than permanently stored. This allows us to demonstrate the interaction between our React frontend and Express API without implementing the full database layer yet. Later, we will use PostgreSQL to provide persistent storage for all relational data, including users, courses, messages, course evaluations, and study spots, while Firebase Storage will provide persistent storage for all uploaded schedule images as well as profile pictures. 

## How to Clone and Run:
**1. Clone the repo**

```sh
git clone https://github.com/addisonwyoung/WolfieCompanion.git
cd WolfieCompanion
```
If you already cloned it before, just update your copy:

```sh
git switch main
git pull
```

**2. Install dependencies**
```sh
npm install
```

**3. Open a second terminal and run the server**
```sh
cd server
npm run dev
```

**4. Run the client in the first terminal**
```sh
cd client
npm run dev
```
**5. Open the localhost URL it provides in a web browser, such as Firefox.**
