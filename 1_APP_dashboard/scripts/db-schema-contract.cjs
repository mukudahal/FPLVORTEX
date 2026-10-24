'use strict';
/** Required legacy tables/columns for adopting a pre-existing database without dropping data. */
module.exports = Object.freeze({
  api_cache: ['key','data','fetched_at'],
  managers: ['id','player_name','team_name','region','overall_rank','total_points','view_count','last_viewed_at'],
  price_snapshots: ['id','element_id','now_cost','transfers_in_event','transfers_out_event','selected_by_percent','change_percent','taken_at'],
  price_predictions: ['id','element_id','web_name','direction','probability','price_at','predicted_at','window_ends','outcome','resolved_at'],
  saved_plans: ['id','entry_id','name','data','projected_points','active','created_at','updated_at'],
  fotmob_mappings: ['fpl_player_code','fotmob_id','matched_at','status'],
  player_image_resolutions: ['fpl_player_code','source','fotmob_id','resolved_at'],
});
