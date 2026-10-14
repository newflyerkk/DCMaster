import {Input,BlobSource,MP4,Output,BufferTarget,Mp4OutputFormat,EncodedPacketSink,EncodedVideoPacketSource,EncodedAudioPacketSource} from 'mediabunny';
// Rebuild a standalone MP4: no live-stream duration sentinels, fragment timing or empty sample tables.
export async function finalizeMP4(blob,{signal,expectedDuration=0,maxBytes=256*1024*1024}={}) {
 const input=new Input({source:new BlobSource(blob),formats:[MP4]});let output;
 try {
  const videos=await input.getVideoTracks(),audios=await input.getAudioTracks();
  if(videos.length!==1)throw Error('视频轨道缺失或数量异常，无法生成 MP4。');
  const tracks=[];let origin=Infinity,end=-Infinity;
  for(const track of [...videos,...audios]){
   signal?.throwIfAborted();const codec=await track.getCodec(),config=await track.getDecoderConfig();
   if(!codec||!config)throw Error('无法读取视频/音频解码配置。');
   const packets=[];
   for await(const packet of new EncodedPacketSink(track).packets()){
    signal?.throwIfAborted();if(!Number.isFinite(packet.timestamp)||!Number.isFinite(packet.duration)||packet.duration<0)throw Error('媒体时间戳无效。');
    origin=Math.min(origin,packet.timestamp);end=Math.max(end,packet.timestamp+packet.duration);packets.push(packet);
   }
   if(!packets.length)throw Error('媒体轨道没有可用帧。');
   tracks.push({track,codec,config,packets,video:videos.includes(track)});
  }
  const duration=end-origin;
  if(!Number.isFinite(duration)||duration<=0||expectedDuration>0&&Math.abs(duration-expectedDuration)>Math.max(0.5,expectedDuration*0.05))throw Error('视频帧时长与播放列表不匹配，已停止保存，请刷新页面后重新提取。');
  output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target:new BufferTarget()});
  for(const item of tracks){
   item.source=item.video?new EncodedVideoPacketSource(item.codec):new EncodedAudioPacketSource(item.codec);
   if(item.video)output.addVideoTrack(item.source,{rotation:await item.track.getRotation()});else output.addAudioTrack(item.source);
  }
  await output.start();
  await Promise.all(tracks.map(async item=>{
   for(let i=0;i<item.packets.length;i++){
    signal?.throwIfAborted();const packet=item.packets[i];
    await item.source.add(packet.clone({timestamp:packet.timestamp-origin}),i===0?{decoderConfig:item.config}:undefined);
   }
   item.source.close();
  }));
  signal?.throwIfAborted();await output.finalize();
  const bytes=output.target.buffer;if(!bytes||bytes.byteLength>maxBytes)throw Error('输出文件过大。');
  return {blob:new Blob([bytes],{type:'video/mp4'}),duration};
 }catch(e){if(output&&output.state!=='finalized')await output.cancel().catch(()=>{});throw e;}finally{input.dispose();}
}
