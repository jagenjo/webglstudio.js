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

		this._generating = false;
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

		//{node: node, name: lightmap_name, size: size, view_size: view_size, padding: padding, fov: fov }
		var options = {
			name: "lightmap.png",
			size: 256,		
			padding: 2,
			view_size: 64,
			fov: 90,
			channel: "none",
			multiplier: 1,
			random_orientation: false,
			high: false,
			fill_color: [0,0,0,1]
		};

		var node = SelectionModule.getSelectedNode() || LS.GlobalScene.root;
		var node_id = node.uid;

		var material_channels = ["none"];
		var mat = node.getMaterial();
		if(mat)
		{
			if(mat.getTextureChannels)
				material_channels = material_channels.concat( mat.getTextureChannels() );
			for(var i in mat.textures)
				if( material_channels.indexOf( i ) == -1)
					material_channels.push(i);
		}

		var tex_sizes = [];
		for(var i = 6; i < 13; i++)
			tex_sizes.push( Math.pow(2,i) );
		var view_sizes = [];
		for(var i = 4; i < 11; i++)
			view_sizes.push( Math.pow(2,i) );


		widgets.addNode("Root node",node_id, function(v){ node_id = v; });

		widgets.addString("Lightmap name",options.name, function(v){ options.name = v; });
		widgets.addCombo("Lightmap size",options.size, { values: tex_sizes, callback: function(v){ options.size = v; }});
		widgets.addCheckbox("High precision", options.high, { callback: function(v){ options.high = v; }});
		widgets.addNumber("Padding",options.padding, { precision: 0, step: 1, callback: function(v){ options.padding = v; }});
		if(mat)
			widgets.addCombo("Apply to channel", "none", { values: material_channels, callback: function(v){ options.channel = v; }});
		widgets.addInfo(null,"Be careful changing the next parameters");
		widgets.addCombo("View size",options.view_size, { values: view_sizes, callback: function(v){ options.view_size = v; }});
		widgets.addNumber("FOV", options.fov, { min: 45, max: 160, precision: 0, step: 1, callback: function(v){ options.fov = v; }});
		widgets.addNumber("Multiplier", options.multiplier, { min: 0, max: 3, callback: function(v){ options.multiplier = v; }});
		widgets.addCheckbox("Random orientation", options.random_orientation, { callback: function(v){ options.random_orientation = v; }});
		widgets.addCheckbox("Blend with previous", options.blend, { callback: function(v){ options.blend = v; }});
		widgets.addColor("Fill color", options.fill_color, { callback: function(v){ options.fill_color = v; }});

		widgets.addSeparator();

		var dialog_progress = null;

		widgets.addButton(null,"Generate Lightmap", function(){
			var node = LS.GlobalScene.getNode(node_id);
			options.node = node;
			dialog_progress = LiteGUI.alert("Generating Lightmap, this could take some time...<br/><span class='progress'></span>");
			setTimeout( inner_start_async, 100); //wait to show modal
		});

		function inner_start()
		{
			var lightmap = LightmapTools.generateLightmap( options );
			inner_complete( lightmap );
		}

		function inner_start_async()
		{
			LightmapTools.generateLightmap( options, inner_complete, inner_progress );
		}

		function inner_complete( lightmap )
		{
			if(options.channel != "none")
			{
				mat.setTexture( options.channel, lightmap.filename );
				if(options.channel == "emissive" && mat.constructor === LS.StandardMaterial)
					mat.emissive = [1,1,1];
			}
			if(dialog_progress)
				dialog_progress.close();
		}

		function inner_progress( pixels_done, pixeles_total )
		{
			dialog_progress.root.querySelector(".progress").innerHTML = ((pixels_done / pixeles_total) * 100).toFixed(0) + "%";
		}

		dialog.adjustSize(4);
	},

	generateLightmap: function( options, on_complete, on_progress )
	{
		if(!options)
			throw("options missing");
		if(this._generating)
		{
			LiteGUI.alert("Already generating");
			return;
		}

		var node = options.node;
		this._generating = true;

		//get mesh
		var RI = node._instances[0];
		if(!RI)
			throw("No RenderInstance in node");
		var mesh = RI.mesh;
		var uniforms = RI.uniforms;

		var size = options.size || 256;
		var view_size = options.view_size || 64;
		var padding = options.padding || 0;
		var total_view_size = gl.getParameter( gl.MAX_TEXTURE_SIZE );
		total_view_size /= 2;
		var views_per_row = total_view_size / view_size;
		var data_type = options.high ? gl.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;

		//create or reuse textures
		var world_position_texture = null;
		var world_normal_texture = null;
		var view_texture = null;

		if(this._session && size == this._session.size )
		{
			world_position_texture = this._session.world_position_texture;
			world_normal_texture = this._session.world_normal_texture;
			view_texture = this._session.view_texture;
			average_row_texture = this._session.average_row_texture;
			average_texture = this._session.average_texture;
		}
		else
		{
			world_position_texture = new GL.Texture( size, size, { format: gl.RGBA, type: gl.FLOAT, filter: gl.NEAREST });
			world_normal_texture = new GL.Texture( size, size, { format: gl.RGBA, type: gl.FLOAT, filter: gl.NEAREST });
			view_texture = new GL.Texture( total_view_size, total_view_size, { format: gl.RGB, filter: gl.NEAREST, type: data_type });
			average_row_texture = new GL.Texture( views_per_row, total_view_size, { format: gl.RGBA, filter: gl.NEAREST, type: data_type });
			average_texture = new GL.Texture( views_per_row, views_per_row, { format: gl.RGBA, filter: gl.NEAREST, type: gl.UNSIGNED_BYTE });
		}

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

		var background_color = vec4.create();
		if(LS.GlobalScene.root.camera)
			background_color.set( LS.GlobalScene.root.camera.background_color );

		//create session data
		var session_data = {
			size: size,
			data_type: data_type,
			view_size: view_size,
			total_view_size: total_view_size,
			views_per_row: views_per_row,

			global_fbo: fbo,
			world_position_texture: world_position_texture,
			world_normal_texture: world_normal_texture,
			positions_data: world_position_texture.getPixels(), //get the positions back to the CPU
			normals_data: world_normal_texture.getPixels(),//get the normals back to the CPU
	
			view_texture: view_texture,
			average_row_texture: average_row_texture,
			average_texture: average_texture,
			average_pixel_info: new Int16Array( views_per_row * views_per_row * 2 ), //x and y of where this pixel should go in the final texture
			lightmap_pixels: new Uint8Array( size * size * 4 ),
			background_color: background_color,
			start_x: 0,
			start_y: 0,
			options: options
		};
		this._session = session_data;

		session_data.average_pixel_info.fill(-1); //to mark used pixels

		LS.RM.registerResource( ":view", session_data.view_texture );
		LS.RM.registerResource( ":average_row", session_data.average_row_texture );
		LS.RM.registerResource( ":average", session_data.average_texture );
		fbo.setTextures([session_data.view_texture]);

		if( on_complete )
		{
			this.doStepsAsync( session_data, options, on_complete, on_progress );
			return null;
		}

		var iterations = 0;

		//FILL the views ***************************
		while(1)
		{
			var ended = this.generateViews( session_data, options );

			//process lightmap
			this.processLightMap( session_data, options );
			console.log( "iteration",iterations );
			iterations++;

			if(ended)
				break;
		}

		return this.finalLightmapStep( session_data, options );
	},

	//better do it async to avoid hanging the computer
	doStepsAsync: function( session_data, options, on_complete, on_progress )
	{
		var that = this;
		var iterations = 0;
		setTimeout( inner, 500 );

		function inner(){
			var ended = that.generateViews( session_data, options );
			that.processLightMap( session_data, options );
			console.log( "iteration",iterations );
			iterations++;
			if(ended)
			{
				var lightmap = that.finalLightmapStep( session_data, options );
				on_complete( lightmap );
				return;
			}

			if(on_progress)
				on_progress( session_data.views_per_row * session_data.views_per_row * iterations, session_data.size * session_data.size );

			setTimeout( inner, 500 );
		}
	},

	finalLightmapStep: function( session_data, options )
	{
		//process lightmap
		console.log( "FINAL ITERATION");
		this.processLightMap( session_data, options );

		console.log( "AFTER FX");
		if( options.padding > 0 )
			this.applyPadding( session_data, options.padding );
		this.applyFillColor( session_data, options.fill_color );

		//upload to GPU
		var old_lightmap = LS.RM.getResource( options.name );
		if(!session_data.lightmap)
		{
			session_data.lightmap = new GL.Texture.fromMemory( session_data.size, session_data.size, session_data.lightmap_pixels, { format: gl.RGBA, filter: gl.LINEAR } );
			LS.RM.registerResource( options.name || ":lightmap", session_data.lightmap );
		}
		else
			session_data.lightmap.uploadData( session_data.lightmap_pixels );

		if(options.blend)
		{
			var temp = GL.Texture.getTemporary( session_data.size, session_data.size );
			GL.Texture.blend( old_lightmap, session_data.lightmap, 0.5, temp );
			temp.copyTo( session_data.lightmap );
			GL.Texture.releaseTemporary( temp );
		}

		session_data.lightmap.toBlobAsync( true, undefined, function(blob){
			session_data.lightmap._original_file = blob;
		} );

		this._generating = false;
		return session_data.lightmap;
	},

	//generates a bunch of views and stores them in the view_texture, returns true if finished all posible views
	generateViews: function( session_data, options )
	{
		//the camera
		var camera = this._camera;
		if(!camera)
			camera = this._camera = new LS.Camera({ fov: options.fov || 90, near: 0.001, far: 10000, aspect: 1 });
		else
			camera.fov = options.fov || 90;

		//some temporary variables to go faster
		var camera_target = vec3.create();
		var pixel_x = 0;
		var pixel_y = 0;
		var average_pixel_info = session_data.average_pixel_info;
		var lightmap_pixels = session_data.lightmap_pixels;
		var bg_R = Math.clamp( session_data.background_color[0] * 255, 0, 255);
		var bg_G = Math.clamp( session_data.background_color[1] * 255, 0, 255);
		var bg_B = Math.clamp( session_data.background_color[2] * 255, 0, 255);
		var instances = LS.Renderer._visible_instances; //filter only static?
		var R = quat.create();
		var size = session_data.size;
		var positions_data = session_data.positions_data;
		var normals_data = session_data.normals_data;
		var view_size = session_data.view_size;
		var views_per_row = session_data.views_per_row;

		var fbo = this._fbo;
		fbo.bind();

		//clear the global view
		gl.clearColor( session_data.background_color[0], session_data.background_color[1], session_data.background_color[2], session_data.background_color[3] );
		gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
		average_pixel_info.fill(-1);

		var start_x = session_data.start_x;
		var start_y = session_data.start_y;

		//for every pixel in the lightmap
		for(var y = start_y; y < size; ++y)
		{
			for(var x = start_x; x < size; ++x)
			{
				var pos = y * size * 4 + x * 4;
				if(positions_data[ pos + 3 ] == 0)
					continue; //empty pixel means out of mesh

				var camera_position = positions_data.subarray(pos,pos+3);
				var camera_forward = normals_data.subarray(pos,pos+3);
				//vec3.scaleAndAdd( camera_position, camera_position, camera_forward, 0.01 ); //for slightly forward
				vec3.add( camera_target, camera_position, camera_forward );

				gl.viewport( pixel_x * view_size, pixel_y * view_size, view_size, view_size );

				//set camera
				var up = Math.abs( vec3.dot( camera_forward, LS.TOP ) ) > 0.999 ? LS.FRONT : LS.TOP;
				camera.lookAt( camera_position, camera_target, up );
				if(options.random_orientation) //rotate the camera randomly, it generates noise but avoid aligment problems
				{
					vec3.normalize( camera_forward, camera_forward );
					var top = camera.getTop();
					quat.setAxisAngle( R, camera_forward, Math.random() * Math.PI * 2 );
					vec3.transformQuat( top, top, R );
					camera.lookAt( camera_position, camera_target, top );
				}
				LS.Renderer.enableCamera( camera, this.render_settings, true );

				//render instances
				var total = LS.Renderer.renderInstances( this.render_settings, instances );
				if(!total) //if nothing renderered
				{
					//store the background color in this pixel
					var pos = (size - y - 1) * size * 4 + x * 4; //flip Y
					lightmap_pixels[ pos ] = bg_R;
					lightmap_pixels[ pos + 1 ] = bg_G;
					lightmap_pixels[ pos + 2 ] = bg_B;
					lightmap_pixels[ pos + 3 ] = 255;
					continue; 
				}

				//store to which pixel in the lightmap belongs this view
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
					//pixel_x = 0; pixel_y = 0;
					session_data.start_x = x+1;
					session_data.start_y = y;
					fbo.unbind();
					return false;
				}
			}
			start_x = 0; //iterate always starting from 0 (except first iteration if resuming)
		}
		fbo.unbind();
		return true;
	},

	processLightMap: function( session_data, options )
	{
		var multiplier = options.multiplier || 1;
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

		average_shader.uniforms({u_offset:[1/total,0],u_texture: 0,u_multiplier: multiplier});
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
		padding = padding || 1;
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

	applyFillColor: function( session_data, color )
	{
		var lightmap_pixels = session_data.lightmap_pixels;
		var size = session_data.size;

		var R = Math.clamp( color[0] * 255, 0, 255);
		var G = Math.clamp( color[1] * 255, 0, 255);
		var B = Math.clamp( color[2] * 255, 0, 255);
		var A = Math.clamp( color[3] * 255, 0, 255);

		for(var y = 0; y < size; ++y)
			for(var x = 0; x < size; ++x)
			{
				var pos = y * size * 4 + x * 4;
				if(	lightmap_pixels[ pos + 3 ] >= 254 )
					continue;
				lightmap_pixels[ pos + 0 ] = R;
				lightmap_pixels[ pos + 1 ] = G;
				lightmap_pixels[ pos + 2 ] = B;
				lightmap_pixels[ pos + 3 ] = A;
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
		uniform float u_multiplier;\n\
		uniform sampler2D u_texture;\n\
		void main() {\n\
			int HALF_IT = ITERATIONS / 2;\n\
			float itereations = float(ITERATIONS);\n\
			vec3 color = vec3(0.0);\n\
			for(int i = 0; i < ITERATIONS; ++i)\n\
			{\n\
				#ifdef USE_DIST_FACTOR\n\
					float factor = u_multiplier * (1.0 - abs(-float(i) / float(HALF_IT) + 1.0));\n\
				#else\n\
					float factor = u_multiplier;\n\
				#endif\n\
				color += texture2D( u_texture, v_coord + u_offset * float(i - HALF_IT) ).xyz * factor;\n\
			}\n\
			gl_FragColor = vec4(color / float(ITERATIONS),1.0);\n\
		}\n\
		"
};


CORE.registerModule( LightmapTools );