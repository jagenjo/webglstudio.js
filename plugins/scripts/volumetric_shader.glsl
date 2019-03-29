

\js
//define exported uniforms from the shader (name, uniform, widget)
this.createSampler("Texture","u_texture");
this.createUniform("Brightness","u_brightness","number", 1, { step: 0.1 });
this.createUniform("Size","u_size","number", 10, { min:0.01 });
this.createUniform("Slice distance","u_slice_distance","number", 1, { step: 0.001 });
this.createUniform("H.Slices","u_hslices","number", 8, { step: 1, precision: 0, min:1,max:64 });
this.createUniform("V.Slices","u_vslices","number", 8, { step: 1, precision: 0, min:1,max:64 });
this.createUniform("Cut value","u_cutvalue","number", 0.5, { step: 0.001, precision: 3, min:0,max:1 });
this.createUniform("Hightlight","u_hightlight","vec3", [0.5,0.0,1.0], { step: 0.001, precision: 3, min:0,max:1 });
//this.render_state.cull_face = false;
this.render_state.blend = true;
this.render_state.blendFunc = [GL.SRC_ALPHA,GL.ONE];
this.render_state.depth_test = false;

\color.vs

precision mediump float;
attribute vec3 a_vertex;
attribute vec3 a_normal;
attribute vec2 a_coord;

//varyings
varying vec3 v_pos;
varying vec3 v_normal;
varying vec2 v_uvs;

//matrices
uniform mat4 u_model;
uniform mat4 u_normal_model;
uniform mat4 u_view;
uniform mat4 u_viewprojection;

//globals
uniform float u_time;
uniform vec4 u_viewport;
uniform float u_point_size;

//camera
uniform vec3 u_camera_eye;
void main() {
	
	vec4 vertex4 = vec4(a_vertex,1.0);
	v_normal = a_normal;
	v_uvs = a_coord;
	
	//vertex
	v_pos = (u_model * vertex4).xyz;
	//normal
	v_normal = (u_normal_model * vec4(v_normal,0.0)).xyz;
	gl_Position = u_viewprojection * vec4(v_pos,1.0);
}

\color.fs

precision mediump float;
//varyings
varying vec3 v_pos;
varying vec3 v_normal;
varying vec2 v_uvs;
//globals
uniform vec3 u_camera_eye;
uniform vec4 u_clipping_plane;
uniform float u_time;
uniform vec3 u_background_color;
uniform vec3 u_ambient_light;

uniform float u_cutvalue;

uniform float u_hslices;
uniform float u_vslices;
uniform float u_size;
uniform sampler2D u_texture;
uniform vec3 u_hightlight;
uniform float u_slice_distance;
uniform float u_brightness;

float ih = 1.0;
float iv = 1.0;
float numslices = 1.0;

vec4 readTexture3DNearest( vec3 local_pos )
{
  local_pos.z *= u_slice_distance;
  
  if(local_pos.x < 0.0 || local_pos.y < 0.0 || local_pos.z < 0.0 || 
     local_pos.x > 1.0 || local_pos.y > 1.0 || local_pos.z > 1.0 )
    return vec4(0.0);
	vec2 coord;
  float slice = floor( numslices * local_pos.z );
  float ix = mod( slice, u_hslices );
  float iy = floor( (slice) / u_hslices);
  coord.x = (local_pos.x + ix) * ih;
  coord.y = 1.0 - (1.0 - local_pos.y + iy) * iv;
  return texture2D( u_texture, coord );
}

vec4 readTexture3DLinear( vec3 local_pos )
{
  local_pos.z *= u_slice_distance;

  if(local_pos.x < 0.0 || local_pos.y < 0.0 || local_pos.z < 0.0 || 
     local_pos.x > 1.0 || local_pos.y > 1.0 || local_pos.z > 1.0 )
    return vec4(0.0);
  local_pos = clamp( local_pos, vec3(0.0),vec3(1.0) );
	vec2 coord;
  float slice_factor = numslices * local_pos.z;
  
  float slice = floor( slice_factor );
  float f = slice_factor - slice;
  float ix = mod( slice, u_hslices );
  float iy = floor( (slice) / u_hslices);
  coord.x = (local_pos.x + ix) * ih;
  coord.y = 1.0 - (1.0 - local_pos.y + iy) * iv;
  vec4 color1 = texture2D( u_texture, coord );
  
  slice = ceil( slice_factor );
  ix = mod( slice, u_hslices );
  iy = floor( (slice) / u_hslices);
  coord.x = (local_pos.x + ix) * ih;
  coord.y = 1.0 - (1.0 - local_pos.y + iy) * iv;
  vec4 color2 = texture2D( u_texture, coord );
  
  return mix( color1, color2, f );  
}

#define SLICES 64

//material
uniform vec4 u_material_color; //color and alpha
void main() {
  ih = 1.0 / u_hslices;
  iv = 1.0 / u_vslices;  
  numslices = u_hslices * u_vslices;
  float islices = 1.0 / float(SLICES);
  
  vec3 E = normalize(v_pos - u_camera_eye);
  vec3 pos = v_pos / u_size + vec3(0.5);
  vec4 final_color = vec4(0.0);
  float density;
  E = 0.1 * (E * u_size) / float(SLICES);

  for( int i = 0; i < SLICES; ++i)
  {
	  //vec4 color = readTexture3DLinear( pos );
  	//density = (color.x + color.y + color.z) * 0.33;
  	density = readTexture3DLinear( pos ).x;
    pos += E;
    
    if(density < u_cutvalue)
      continue;
   
    //density += u_hightlight.z * max(0.0, (abs(density - u_hightlight.x)) / density * u_hightlight.y );
    float highlight_density = max(0.0, u_hightlight.z * ( 1.0 - abs(density - u_hightlight.x) / u_hightlight.y) );
    final_color += vec4(density * u_brightness) * islices + highlight_density * u_material_color;
  }
   
	gl_FragColor = vec4( final_color.xyz, 1.0 );
}

