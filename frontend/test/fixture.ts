import {Encoder, Profile} from '@garmin/fitsdk';
export function fitFixture(sports = ['running'], options: {sensors?: boolean} = {}) {
  const encoder = new Encoder();
  const start = new Date('2026-10-01T08:00:00Z');
  encoder.onMesg(Profile.MesgNum.FILE_ID, {type:'activity', manufacturer:'development', timeCreated:start});
  sports.forEach((sport, i) => encoder.onMesg(Profile.MesgNum.SESSION, {
    sport, startTime: new Date(start.getTime()+i*600000), totalTimerTime:600,
    totalDistance:1000, totalAscent:12, ...(options.sensors === false ? {} : {avgHeartRate:140}),
  }));
  for (let i=0; i<10; i++) encoder.onMesg(Profile.MesgNum.RECORD, {
    timestamp:new Date(start.getTime()+i*1000),
    ...(options.sensors === false ? {} : {
      positionLat:Math.round((48+i*0.001)/180*2**31),
      positionLong:Math.round((2+i*0.001)/180*2**31), heartRate:130+i,
      enhancedSpeed:3.5, cadence:85, power:200, enhancedAltitude:150+i, temperature:18,
    }),
  });
  encoder.onMesg(Profile.MesgNum.LAP,{startTime:start,totalTimerTime:600,totalDistance:1000,...(options.sensors === false ? {} : {avgHeartRate:140})});
  return encoder.close();
}
