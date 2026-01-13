'use strict';

const Homey = require('homey');
const { HomeyAPI } = require('homey-api');

module.exports = class MoodStateApp extends Homey.App {

  async onInit() {
    const api = await HomeyAPI.createAppAPI({
      homey: this.homey,
    });

    const cardMoodIsActive = this.homey.flow.getConditionCard('mood-is-active');

    cardMoodIsActive.registerArgumentAutocompleteListener("mood", async (query, args) => {
      const moods = await api.moods.getMoods();
      return Object.values(moods)
        .filter(mood => mood.name.toLowerCase().includes(query.toLowerCase()))
        .map(mood => {
          return {
            name: mood.name,
            id: mood.id,
          };
        });
    });

    cardMoodIsActive.registerRunListener(async (args) => {
      const mood = await api.moods.getMood({ id: args.mood.id });
      if (!mood?.devices) {
        this.log(`Mood ${mood.id} has no devices`);
        return false;
      }
      const deviceEntries = Object.entries(mood.devices);
      const devicesById = {};
      await Promise.all(
        deviceEntries.map(async ([deviceId]) => {
          devicesById[deviceId] = await api.devices.getDevice({ id: deviceId });
        })
      );
      for (const [deviceId, moodData] of deviceEntries) {
        const device = devicesById[deviceId];
        if (!device) {
          // Device not found
          this.log(`Device ${deviceId} not found for mood ${mood.id}`);
          return false;
        }
        if (!device.available) {
          // Device is offline
          this.log(`Device ${deviceId} is offline for mood ${mood.id}`);
          return false;
        }
        for (const [capabilityId, moodValue] of Object.entries(moodData.state)) {
          const cap = device.capabilitiesObj?.[capabilityId];
          if (!cap) {
            // Capability not found on device
            this.log(`Capability ${capabilityId} not found on device ${deviceId} for mood ${mood.id}`);
            continue;
          }
          const deviceValue = cap.value;
          if (typeof moodValue === 'number'){
            // Slight relaxation for float comparisons
            if (Math.abs(deviceValue - moodValue) > 0.01) {
              this.log(`Value mismatch for capability ${capabilityId} on device ${deviceId} for mood ${mood.id}: expected ${moodValue}, got ${deviceValue}`);
              return false;
            }
          }
          else if (deviceValue !== moodValue) {
            this.log(`Value mismatch for capability ${capabilityId} on device ${deviceId} for mood ${mood.id}: expected ${moodValue}, got ${deviceValue}`);
            return false;
          }
        }
      }
      this.log(`Mood ${mood.id} is active`);
      return true;
    });
  }

};
