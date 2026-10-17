
2026.10 Hack The Valley Datasheet
Toronto Civic Data Starter Guide
The School of Cities challenge is designed around publicly available Toronto civic and urban data. Teams are encouraged to identify, download, clean, combine, and interpret datasets relevant to the problem they want to solve.

Core Data Sources
Source

What it contains

Notes

City of Toronto Open Data Portal

City datasets covering transportation, housing, infrastructure, services, development, parks, recreation, permits, elections, and many other topics.

Good first place to search for Toronto-specific data.

Statistics Canada – Census

Population, age, income, housing, immigration, language, education, employment, commuting, and other demographic and socioeconomic variables.

Data can be accessed at census tract and other geographic levels.

CMHC Housing Data

Rental markets, vacancy, rents, housing supply, starts and other housing indicators.

Especially useful for housing and affordability projects.

Geography and Mapping
Dataset

What it contains

Possible uses

City Wards

Boundaries for Toronto’s 25 municipal wards.

Election analysis, ward-level tools, report cards, policy comparisons.

Neighbourhoods

Boundaries for Toronto’s official neighbourhood geography.

Neighbourhood-level comparisons and mapping.

2021 Census Boundary Files

Statistics Canada geographic boundary files, including census tracts.

Joining Census Profile data to maps and spatial analysis.

OpenStreetMap

Streets, paths, buildings, amenities and other volunteered geographic information.

Street-network analysis, accessibility, route planning and amenity mapping.

A Toronto-only census tract boundary file may also be provided for convenience.

OpenStreetMap data can be downloaded or queried programmatically using tools such as OSMnx or Overpass Turbo. See the School of Cities chapter Working with OpenStreetMap for a practical introduction.

Census and Demographic Data
Dataset

What it contains

Possible uses

2021 Census Profile

Detailed demographic, socioeconomic, housing and commuting variables for Canadian geographies.

Income, renter share, age, immigration, employment, commute mode, education and other neighbourhood characteristics.

Toronto Neighbourhood Profiles

Census-derived characteristics for Toronto neighbourhoods.

Easier neighbourhood-level alternative to working directly with census tracts.

Toronto Ward Profiles

Census-derived characteristics for Toronto’s 25 wards.

Ward-level demographic and socioeconomic comparisons.

For the two Toronto profile datasets above, search the Open Data catalogue for Neighbourhood Profiles or Ward Profiles (25-Ward Model).

Elections and Civic Participation
Dataset

What it contains

Possible uses

Toronto Municipal Election Results

Historical mayoral, councillor and trustee results, including poll-level results and voter statistics where available.

Turnout analysis, local political geography, election comparison.

Ontario Provincial Election Results

Official Ontario election results by electoral district and candidate.

Comparing municipal patterns with provincial elections.

Federal Election Results

Official federal election results from Elections Canada.

Comparing municipal, provincial and federal political geography.

Toronto Election Financial Disclosures

Candidate financial statements, contributions and campaign expenses for Toronto municipal elections.

Campaign finance, fundraising patterns and candidate-level analysis.

Where official files are difficult to work with directly, the School of Cities may provide selected cleaned election, turnout, or campaign-finance files for download.

Housing and Affordability
Dataset

What it contains

Possible uses

Apartment Building Evaluation

Evaluation information for apartment buildings participating in RentSafeTO.

Renter-facing tools, apartment comparisons, building-condition analysis.

Active Building Permits

Current building permit applications and permits.

Construction activity, redevelopment and neighbourhood change.

Cleared Building Permits

Historical permits that have completed or otherwise cleared the permit process.

Long-term development trends and completed construction activity.

Development Applications

Planning applications including rezoning, site plan and other development activity.

Development pressure, proposed growth and neighbourhood change.

Toronto Housing Data Hub – Housing Data

Tracks progress toward Toronto’s housing targets, including new homes, rent-controlled homes, affordable rental homes, RGI homes, social housing, and development stages. Data include ward-level breakdowns and downloadable raw data for some indicators.

Compare housing targets with actual progress, identify wards with more or fewer affordable/RGI approvals, or build tools tracking housing delivery.

Affordable Rental Housing Map

Interactive map of rent-controlled, affordable rental, and RGI housing projects, including location, ward and development status.

Map affordable housing supply, identify geographic gaps, compare planned and completed projects, or explore access to nearby services.

CMHC Rental Market Report Data Tables

Downloadable rental market tables including rents, vacancy and rental stock.

Rental affordability and market comparisons.

CMHC Housing Market Information Portal

Interactive tables, maps and charts for Toronto housing-market indicators.

Quick exploration before downloading or selecting specific indicators.

The Census Profile is also useful for housing analysis, including renter/owner tenure, shelter-cost burden, dwelling type, household income and related measures.

Transit, Congestion and Accessibility
Dataset

What it contains

Possible uses

TTC Routes and Schedules

TTC routes, stops, trips and schedules in GTFS format.

Transit accessibility, routing, travel-time analysis and stop/route mapping.

TTC Subway Delay Data

Historical subway service-delay records.

Reliability, delay analysis and transit-performance tools.

TTC Streetcar Delay Data

Historical streetcar service-delay records.

Reliability and route-level delay analysis.

TTC Bus Delay Data

Historical bus service-delay records.

Reliability and route-level delay analysis.

Cycling Network

Toronto cycling infrastructure and route network.

Cycling access, network gaps and multimodal transportation analysis.

Bike Share Toronto

Bike Share station, status and related system data.

Access, network coverage, station availability and multimodal tools.

Metrolinx Open Data

Regional transit and transportation data for the GTHA.

GO Transit and regional accessibility projects.

Transitland

Standardized transit feeds from agencies around the world.

Accessing and comparing GTFS feeds programmatically.

For travel-time and accessibility analysis, teams can use routing libraries such as R5 / r5py with GTFS and street-network data. GTFS data can support questions such as how long it takes to reach jobs, services, downtown, transit hubs, or other destinations from different parts of Toronto.

The Census Profile also includes commute mode and commute-duration variables, which can complement transit-network data.

Municipal Services and Civic Infrastructure
Dataset

What it contains

Possible uses

Parks and Recreation Facilities

Locations and information for recreation centres, pools, arenas, sports facilities and other Parks and Recreation assets.

Service finders, accessibility analysis and infrastructure-gap tools.

Licensed Child Care Centres

Child-care facility locations, capacity, operator information and program details.

Child-care access, service demand and neighbourhood comparisons.

311 Service Requests – Customer Initiated

Resident service requests across participating City divisions, including request type and timing.

Service demand, infrastructure issues, forecasting and neighbourhood comparison.

There are many other useful municipal-service datasets available through Toronto Open Data, including libraries, parks and amenities, shelters, public washrooms, recreation programs, road restrictions, emergency services and other public infrastructure. Teams should search the catalogue based on the civic problem they want to address.

311 data can be particularly useful but should be interpreted carefully. The public dataset covers only part of the 311 system, and categories and administrative geographies have changed over time.

Land Use, Development and the Built Environment
Dataset

What it contains

Possible uses

Toronto Zoning By-law

Geographic zoning information for Toronto properties.

Land-use analysis, development potential and neighbourhood form.

Development Applications

Current and historical planning applications.

Mapping proposed development and neighbourhood change.

Active Building Permits

Active construction, renovation and demolition permits.

Current construction activity and redevelopment.

Cleared Building Permits

Completed or cleared building permit records.

Historical development and construction trends.

OpenStreetMap

Buildings, road networks, amenities, paths and land-use features.

Built-form, accessibility and network analysis.

Additional datasets relating to parcels, addresses, heritage properties, trees, parks, roads and other parts of the built environment can be found through the Toronto Open Data catalogue.

Additional Sources
Source

Description

Open Government Canada

Federal open-data catalogue covering transportation, environment, infrastructure, economics and many other topics.

CANUE

Canadian Urban Environmental Health Research Consortium datasets and urban environmental measures.

Google Dataset Search

Search engine for locating public datasets from many different organizations.

ArcGIS Hub

Searchable catalogue of public geospatial datasets.

Native Land Digital

Educational mapping resource relating to Indigenous territories, treaties and languages.

These sources are starting points rather than limits. Teams are encouraged to find additional credible public datasets where they help solve the problem their product is designed around.


