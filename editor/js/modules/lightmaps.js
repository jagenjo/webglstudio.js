var LightmapTools = {
	init: function()
	{
		LiteGUI.menubar.add("Actions/Lightmap Tools", { callback: function() { 
			LightmapTools.showToolsDialog();
		}});

		this.render_settings = new LS.RenderSettings();
		this.render_settings.render_gui = false;
		this.render_settings.render_helpers = false;
		this.render_settings.render_fx = false;
	},

	showToolsDialog: function()
	{
		if(!gl.extensions["OES_texture_float"])
			LiteGUI.alert("Cannot generate lightmaps, your GPU does not support FLOAT textures");

		if(this.dialog)
			this.dialog.close();

		var dialog = new LiteGUI.Dialog("dialog_lightmap_tools", {title:"Lightmap Tools", close: true, minimize: true, width: 300, height: 440, scroll: false, draggable: true});
		dialog.show('fade');
		dialog.setPosition(100,100);
		this.dialog = dialog;

		var widgets = new LiteGUI.Inspector({ name_width: "50%" });
		dialog.add( widgets );
		widgets.onchange = function()
		{
			RenderModule.requestFrame();
		}

		var node = SelectionModule.getSelectedNode() || LS.GlobalScene.root;
		var node_id = node.uid;
		var lightmap_name = "lightmap.png";		
		var size = 256;		
		var padding = 2;
		var view_size = 64;
		var fov = 90;

		widgets.addNode("Root node",node_id, function(v){ node_id = v; });

		widgets.addString("Lightmap name",lightmap_name, function(v){ lightmap_name = v; });
		widgets.addNumber("Lightmap size",size, { min: 32, max: 4096, precision: 0, step: 1, callback: function(v){ size = v; }});
		widgets.addNumber("Padding",padding, { precision: 0, step: 1, callback: function(v){ padding = v; }});
		widgets.addInfo(null,"Be careful changing the next parameters");
		widgets.addNumber("View size",view_size, { min: 32, max: 1024, precision: 0, step: 1, callback: function(v){ view_size = v; }});
		widgets.addNumber("FOV", fov, { min: 45, max: 160, precision: 0, step: 1, callback: function(v){ fov = v; }});

		widgets.addSeparator();

		widgets.addButton(null,"Generate Lightmap", function(){
			var node = LS.GlobalScene.getNode(node_id);

			var dialog = LiteGUI.alert("Generating Lightmap, this could take some time...");
			setTimeout( function(){ 
				LightmapTools.generateLightmap({node: node, name: lightmap_name, size: size, view_size: view_size, padding: padding, fov: fov });
				dialog.close();
			},10); //wait to show modal
		});

		dialog.adjustSize(4);
	},

	generateLightmap: function( options )
	{
		if(!options)
			throw("options missing");

		var node = options.node;

		//get mesh
		var RI = node._instances[0];
		if(!RI)
			throw("No RenderInstance in node");
		var mesh = RI.mesh;
		var uniforms = RI.uniforms;

		var size = options.size || 256;
		var view_size = options.view_size || 64;
		var padding = options.padding || 0;

		//create textures
		var world_position_texture = new GL.Texture( size, size, { type: gl.FLOAT, filter: gl.NEAREST });
		var world_normal_texture = new GL.Texture( size, size, { type: gl.FLOAT, filter: gl.NEAREST });

		LS.RM.registerResource( ":worldpos", world_position_texture );
		LS.RM.registerResource( ":worldnormal", world_normal_texture );

		var fbo = this._fbo = new GL.FBO([ world_position_texture, world_normal_texture ]);
		fbo.bind();

		//render the world space info
		var world_shader = this._world_shader || new GL.Shader( this._world_shader_vs, this._world_shader_fs );

		gl.disable( gl.DEPTH_TEST );
		gl.disable( gl.CULL_FACE );
		gl.disable( gl.BLEND );

		gl.clearColor(0,0,0,0);
		gl.clear( gl.COLOR_BUFFER_BIT );

		world_shader.uniforms({ u_model: RI.matrix, u_normal_model: RI.normal_matrix });
		world_shader.draw( mesh, gl.TRIANGLES );

		fbo.unbind();

		//get the positions back to the CPU
		var positions_data = world_position_texture.getPixels();
		//get the normals back to the CPU
		var normals_data = world_normal_texture.getPixels();
	
		var total_view_size = gl.getParameter( gl.MAX_TEXTURE_SIZE );
		total_view_size /= 2;
		var views_per_row = total_view_size / view_size;

		var background_color = vec4.create();
		if(LS.GlobalScene.root.camera)
			background_color.set( LS.GlobalScene.root.camera.background_color );

		var data_type = gl.UNSIGNED_BYTE;

		var session_data = {
			size: size,
			view_size: view_size,
			total_view_size: total_view_size,
			views_per_row: views_per_row,
			global_fbo: fbo,
			world_position_texture: world_position_texture,
			world_normal_texture: world_normal_texture,
			view_texture: new GL.Texture( total_view_size, total_view_size, { format: gl.RGB, filter: gl.NEAREST, type: data_type }),
			average_row_texture: new GL.Texture( views_per_row, total_view_size, { format: gl.RGBA, filter: gl.NEAREST, type: data_type }),
			average_texture: new GL.Texture( views_per_row, views_per_row, { format: gl.RGBA, filter: gl.NEAREST, type: data_type }),
			average_pixel_info: new Int16Array( views_per_row * views_per_row * 2 ), //x and y of where this pixel should go in the final texture
			lightmap_pixels: new (data_type == gl.FLOAT ? Float32Array : Uint8Array)( size * size * 4 ),
			background_color: background_color
		};

		session_data.average_pixel_info.fill(-1); //to mark used pixels

		LS.RM.registerResource( ":view", session_data.view_texture );
		LS.RM.registerResource( ":average_row", session_data.average_row_texture );
		LS.RM.registerResource( ":average", session_data.average_texture );
		fbo.setTextures([session_data.view_texture]);


		var camera = this.camera = new LS.Camera({ fov: options.fov || 90, near: 0.001, far: 10000, aspect: 1 });

		var camera_target = vec3.create();
		var pixel_x = 0;
		var pixel_y = 0;
		var average_pixel_info = session_data.average_pixel_info;

		var instances = LS.Renderer._visible_instances; //filter only static?

		var iterations = 0;

		fbo.bind();

		gl.clearColor( background_color[0], background_color[1], background_color[2], background_color[3] );
		gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

		//for every pixel
		for(var y = 0; y < size; ++y)
		{
			for(var x = 0; x < size; ++x)
			{
				var pos = y * size * 4 + x * 4;
				if(positions_data[ pos + 3 ] == 0)
					continue; //empty pixel means out of mesh

				var camera_position = positions_data.subarray(pos,pos+3);
				var camera_forward = normals_data.subarray(pos,pos+3);
				vec3.add( camera_target, camera_position, camera_forward );


				gl.viewport( pixel_x * view_size, pixel_y * view_size, view_size, view_size );

				//set camera
				var up = vec3.dot( camera_forward, LS.TOP ) > 0.999 ? LS.FRONT : LS.TOP;
				camera.lookAt( camera_position, camera_target, up );
				LS.Renderer.enableCamera( camera, this.render_settings, true );

				//render instances
				var total = LS.Renderer.renderInstances( this.render_settings, instances );
				if(!total)
					continue; //nothing renderered

				pos = pixel_y * views_per_row * 2 + pixel_x * 2;
				average_pixel_info[ pos ] = x;
				average_pixel_info[ pos + 1] = y;

				//adjust viewport
				pixel_x += 1;
				if( pixel_x >= views_per_row )
				{
					pixel_x = 0;
					pixel_y += 1;
				}
				if( pixel_y  >= views_per_row ) //the view texture is full, process it
				{
					pixel_x = 0;
					pixel_y = 0;
					fbo.unbind();
					//process lightmap
					this.processLightMap( session_data );
					console.log( "iteration",iterations );
					iterations++;

					//clear and resume process
					fbo.bind();
					gl.clearColor( background_color[0], background_color[1], background_color[2], background_color[3] );
					gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
					average_pixel_info.fill(-1);
					//break;
				}
			}
		}

		fbo.unbind();
		//process lightmap
		this.processLightMap( session_data );
		console.log( "FINAL ITERATION");

		if(padding > 0)
			this.applyPadding( session_data, padding );

		//upload to GPU
		if(!session_data.lightmap)
		{
			session_data.lightmap = new GL.Texture.fromMemory( size, size, session_data.lightmap_pixels, { format: gl.RGBA, filter: gl.LINEAR } );
			LS.RM.registerResource( options.name || ":lightmap", session_data.lightmap );
		}
		else
			session_data.lightmap.uploadData( session_data.lightmap_pixels );
	},

	processLightMap: function( session_data )
	{
		//take the view_texture and compute the average of every row of every view
		var fbo = session_data.average_fbo;
		if(!fbo)
			fbo = session_data.average_fbo = new GL.FBO([session_data.average_row_texture]);
		else
			fbo.setTextures([session_data.average_row_texture]);

		var mesh = GL.Mesh.getScreenQuad();
		var average_shader = session_data.average_shader;
		if(!average_shader)
			average_shader = session_data.average_shader = new GL.Shader( GL.Shader.SCREEN_VERTEX_SHADER, this._average_shader_fs, { ITERATIONS: session_data.view_size });

		var total = (session_data.total_view_size);

		//horizontal average
		fbo.bind();

		average_shader.uniforms({u_offset:[1/total,0],u_texture: 0});
		session_data.view_texture.bind(0);
		average_shader.draw( mesh, gl.TRIANGLES );

		fbo.unbind();

		//vertical average
		fbo.setTextures([session_data.average_texture]);
		fbo.bind();

		average_shader.uniforms({u_offset:[0,1/total]});
		session_data.average_row_texture.bind(0);
		average_shader.draw( mesh, gl.TRIANGLES );

		fbo.unbind();

		//read the pixels back
		var average_pixels = session_data.average_texture.getPixels();
		var average_pixels_info = session_data.average_pixel_info;

		//move pixels to right location
		var lightmap_pixels = session_data.lightmap_pixels;
		var lightmap_size = session_data.size;
		var views_per_row = session_data.views_per_row;

		for(var y = 0; y < views_per_row; ++y)
			for(var x = 0; x < views_per_row; ++x)
			{
				var info_pos = y * views_per_row * 2 + x * 2;
				var l_x = average_pixels_info[ info_pos ];
				if(l_x == -1)
					break;
				var l_y = lightmap_size - average_pixels_info[ info_pos + 1] - 1;
				var lpos = l_y * lightmap_size * 4 + l_x * 4; //pos of pixel in lightmap

				var pos = y * views_per_row * 4 + x * 4; //pos of average color

				lightmap_pixels[ lpos ] = average_pixels[ pos ];
				lightmap_pixels[ lpos + 1 ] = average_pixels[ pos + 1 ];
				lightmap_pixels[ lpos + 2 ] = average_pixels[ pos + 2 ];
				lightmap_pixels[ lpos + 3 ] = 255;
			}
	},

	applyPadding: function( session_data, padding )
	{
		var lightmap_pixels = session_data.lightmap_pixels;
		var size = session_data.size;

		for(var y = 0; y < size; ++y)
			for(var x = 0; x < size; ++x)
			{
				var pos = y * size * 4 + x * 4;
				if( lightmap_pixels[ pos + 3 ] > 0 ) 
					continue;

				var r = 0;
				var g = 0;
				var b = 0;
				var num = 0;

				var miny = Math.max(0,y - padding);
				var minx = Math.max(0,x - padding);
				var maxy = Math.min(size,y + padding);
				var maxx = Math.min(size,x + padding);
		
				for(var y2 = miny; y2 < maxy; ++y2)
					for(var x2 = minx; x2 < maxx; ++x2)
					{
						var pos2 = y2 * size * 4 + x2 * 4;
						if( lightmap_pixels[ pos2 + 3 ] != 255 ) 
							continue;
						r += lightmap_pixels[ pos2 ];
						g += lightmap_pixels[ pos2 + 1 ];
						b += lightmap_pixels[ pos2 + 2];
						num += 1;											
					}

				if(!num) //too far
					continue;

				lightmap_pixels[pos] = r / num;
				lightmap_pixels[pos+1] = g / num;
				lightmap_pixels[pos+2] = b / num;
				lightmap_pixels[pos+3] = 254; //254 to avoid reusing this pixel
			}
	},

	_world_shader_vs: "\n\
		precision highp float;\n\
		attribute vec3 a_vertex;\n\
		attribute vec3 a_normal;\n\
		attribute vec2 a_coord;\n\
		\n\
		varying vec3 v_pos;\n\
		varying vec3 v_normal;\n\
		\n\
		uniform mat4 u_model;\n\
		uniform mat4 u_normal_model;\n\
		\n\
		void main() {\n\
			vec4 vertex4 = vec4(a_vertex,1.0);\n\
			v_normal = a_normal;\n\
			v_pos = (u_model * vertex4).xyz;\n\
			v_normal = (u_normal_model * vec4(v_normal,1.0)).xyz;\n\
			gl_Position = vec4(a_coord * 2.0 - vec2(1.0),0.0,1.0);\n\
		}\n\
		",
	_world_shader_fs: "\n\
		#extension GL_EXT_draw_buffers : enable\n\
		precision highp float;\n\
		varying vec3 v_pos;\n\
		varying vec3 v_normal;\n\
		void main() {\n\
			gl_FragData[0] = vec4(v_pos,1.0);\n\
			gl_FragData[1] = vec4(v_normal,1.0);\n\
		}\n\
		",
		
	_average_shader_fs: "\n\
		precision highp float;\n\
		varying vec2 v_coord;\n\
		uniform vec2 u_offset;\n\
		uniform sampler2D u_texture;\n\
		void main() {\n\
			int HALF_IT = ITERATIONS / 2;\n\
			vec3 color = vec3(0.0);\n\
			for(int i = 0; i < ITERATIONS; ++i)\n\
				color += texture2D( u_texture, v_coord + u_offset * float(i - HALF_IT) ).xyz;\n\
			gl_FragColor = vec4(color / float(ITERATIONS),1.0);\n\
		}\n\
		"
};


CORE.registerModule( LightmapTools );