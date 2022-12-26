# StravaApiV3.UpdatableActivity

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**commute** | **Boolean** | Whether this activity is a commute | [optional] 
**trainer** | **Boolean** | Whether this activity was recorded on a training machine | [optional] 
**hideFromHome** | **Boolean** | Whether this activity is muted | [optional] 
**description** | **String** | The description of the activity | [optional] 
**name** | **String** | The name of the activity | [optional] 
**type** | [**ActivityType**](ActivityType.md) | Deprecated. Prefer to use sport_type. In a request where both type and sport_type are present, this field will be ignored | [optional] 
**sportType** | [**SportType**](SportType.md) |  | [optional] 
**gearId** | **String** | Identifier for the gear associated with the activity. ‘none’ clears gear from activity | [optional] 


