railway per month  - $120 (DB) 20 usd
20 usd base price

total - $140 * 1.18  100
monthly =>  16,520
yearly =>  1,98,240

---

# Finished :

## Mobile
### FInished:
    * Dasahboard with basic operation (Start Patrol, Syncing, Incident Reporting, SOS)
    * Patrol Recording 
        - Tracking user telemetry (movement, gps, direction, type of travel)
        - Marking movement on the MAP (only visible in the current patrol reports) : extension (overall map plotting)
        - Incidents reporting - with images and location.
        - Time and patrol tampering prevention.
        - Syncing form local to cloud & viceaversa
### Pending: (19d)
    * Face recognization system (use computer vision) (1d)
    * Main map 
        - Missing compartments (2days)
        - compartment & beats (upload in db, pull related geocoords for the user based on current location) (2days)
        - Marking of officers travel coord paths (2d)
    

        - Changing the MTtiles map to a 3d view / street map. (3days)
        - Creating and mapping GRIDS in the map and each grid should be dynamic to change in sqkm, officers view the travelled path through grid view. (1d)
        - creating and mapping user to the particular region beloned to based on the cader. (1d)
        - adding officer analytics with a range selection (required distance travelled, places coverd, max & min covered locations, which patrols are more day/night. incidents reported)   (3days)       
        

        - INFO REQUIRED TO COLLECT FROM 'FO' : collect infor of the ponds, siting location, posts and checkpoints etc. to mark and track whether the officer has travelled there in the duration of patrol (2d)
            - PRovide the officer with least visited places info and alert them about their places siting and provide them analytics about it. 
        - Make incident reporting to be independent of patrol, if incidents are reported during patrol then link incident with the patrolID to identify at what patrol was the incident reported. (1/2 d)
        - Test the SOS (current status : works when there is a minial network alerts the higher authority) and add the calling and reachout without connection (implemenation pending) (1d).


## Web:
### Finished :
    * Login
    * SOS notification alert
    * Dashboard (KPI cards live data)
    * Patrol operations (report generation, partol permissions, individual patrol details)
    * Ranger Management (create user, user current duty status)
    * Obseravations & Reports (KPI, individual user obsearcation data/)
    * GIS intelligence (maps, and boundaries, GRIDS)
    * Analytics & Insights (static page)
### Pending : 
    * Dashboard 
        - Removal of complete dashboard (reason: duplication of data from differnet modules)
    * SOS & Alerts (2hrs)
        - Add the SOS alerts into the web in realtime without reloading page.
    * SOS & Alerts (2hrs)
    - Add the SOS alerts into the web in realtime without reloading page.ate reports (Change the vlues in compartments dropdown)
        - Design reports layout (Speak with FO)
        - remove all patrols KPI card, redo of the elements in theh page
    * Ranger Mangement 
        - add pagenation for list, remove unwanted KPI cards
        - Remove Teams & assessment
    * Observations & Reports
        - removal of unwanted KIP cards
        - adding officer analytics with a range selection (required distance travelled, places coverd, max & min covered locations, which patrols are more day/night. incidents reported)   (3days).
        - Convert the list to table.
    * GIS 
        - Patorl paths, and incidentss plotting on map.