var LabModule = {
	name: "GPU",
	bigicon: "imgs/tabicon-debug.png",

	enabled: false,
	mode: "textures",
	channels: "rgba",
	exposure: 1,

	show_name: true,
	rotate: true,
	meshes_axis: "Y",
	meshes_mode: "phong_wireframe",
	cull_face: true,

	offset: vec2.create(0,0),
	scale: 1,

	items: [],
	selected_item: null,

	_last_mouseup: 0,

	settings: {
		render_frame: false,
		render_filename: true
	},

	init: function()
	{
		this.tab = LiteGUI.main_tabs.addTab( this.name , {id:"labtab", bigicon: this.bigicon, size: "full", callback: function(tab) {
			LabModule.enabled = true;
			RenderModule.canvas_manager.addWidget( LabModule );
			RenderModule.appendViewportTo( LabModule.tab.content );
		},
		callback_leave: function() {
			LabModule.enabled = false;
			RenderModule.appendViewportTo( null );
			RenderModule.canvas_manager.removeWidget( LabModule );
		}});

		var content = document.getElementById("labtab");
		content.style.padding = "0px";
		content.style.overflow = "hidden";

		var mode_tabs = new LiteGUI.Tabs({ id:"labmodetabs", callback: function(v) {   }});
		this.tab.add( mode_tabs );
		mode_tabs.root.style.marginTop = "4px";
		mode_tabs.root.style.backgroundColor = "#111";
		this.mode_tabs = mode_tabs;

		var inspector = this.top_inspector = new LiteGUI.Inspector({ widgets_width: 200, one_line: true });
		content.appendChild( inspector.root );

		mode_tabs.addTab("Textures", function(){
			LabModule.setMode("textures");
		});
		mode_tabs.addTab("Meshes",function(){
			LabModule.setMode("meshes");
		});
		mode_tabs.addTab("Materials",function(){
			LabModule.setMode("materials");
		});

		//enable WebGL Canvas2D renderer
		if( RenderModule.canvas_manager.canvas )
			this.prepareGL();
	},

	setMode: function( mode )
	{
		this.mode = mode;
		var inspector = this.top_inspector;
		inspector.clear();

		inspector.addCheckbox("Show name", this.show_name, { callback: function(v){
			LabModule.show_name = v;			
		}});		

		if( this.mode == "textures" )
		{
			inspector.addButton( null, "Reset", { callback: function(){ 
				LabModule.channels = "RGBA";
				LabModule.exposure = 1;
			}});
			inspector.addCombo("Channels", this.channels, { values:["RGBA","RGB","R","G","B","A"], callback: function(v){
				LabModule.channels = v;			
			}});		
			inspector.addSlider("Exposure", this.exposure, { max: 4, callback: function(v){
				LabModule.exposure = v;			
			}});		
		}
		else if( this.mode == "meshes" )
		{
			inspector.addCheckbox("Rotate", this.rotate, { callback: function(v){
				LabModule.rotate = v;			
			}});
			inspector.addCombo("Axis", this.meshes_axis, { values:["X","Y","Z"], callback: function(v){
				LabModule.meshes_axis = v;			
			}});		
			inspector.addCombo("Render Mode", this.meshes_mode, { values:["phong_wireframe","phong","normal","wireframe","X-RAY","UV_wireframe","Normal Cloud"], callback: function(v){
				LabModule.meshes_mode = v;			
			}});		
			inspector.addCheckbox("Cull face", this.cull_face, { callback: function(v){
				LabModule.cull_face = v;			
			}});		
		}
		else if( this.mode == "materials" )
		{
			inspector.addCheckbox("Rotate", this.rotate, { callback: function(v){
				LabModule.rotate = v;			
			}});		
		}
	},

	prepareGL: function()
	{
		enableWebGLCanvas( RenderModule.canvas_manager.canvas );

		this.camera = new LS.Camera();
		this.camera.lookAt([0,0,0],[0,0,-1],[0,1,0]);

		this._channel_shader = new GL.Shader('\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 v_coord;\n\
			uniform mat4 u_mvp;\n\
			void main() {\n\
				v_coord = a_coord;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			','\
			precision mediump float;\n\
			varying vec2 v_coord;\n\
			uniform vec4 u_color;\n\
			uniform float u_channel;\n\
			uniform float u_exposure;\n\
			uniform sampler2D u_texture;\n\
			void main() {\n\
			  vec2 coord = v_coord;\n\
			  vec4 channels = texture2D( u_texture, coord );\n\
			  vec4 color;\n\
			  if( u_channel == 0.0 )\n\
				color = vec4( channels[0], channels[0], channels[0], 1.0);\n\
			  else if( u_channel == 1.0 )\n\
				color = vec4( channels[1], channels[1], channels[1], 1.0);\n\
			  else if( u_channel == 2.0 )\n\
				color = vec4( channels[2], channels[2], channels[2], 1.0);\n\
			  else if( u_channel == 3.0 )\n\
				color = vec4( channels[3], channels[3], channels[3], 1.0);\n\
			  else\n\
				color = channels;\n\
			  color.xyz *= u_exposure;\n\
			  gl_FragColor = color;\n\
			}\
		');

		this._normal_shader = new GL.Shader('\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec3 a_normal;\n\
			varying vec3 v_normal;\n\
			uniform mat4 u_model;\n\
			uniform mat4 u_mvp;\n\
			void main() {\n\
				v_normal = (u_model * vec4(a_normal,0.0)).xyz;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			','\
			precision mediump float;\n\
			varying vec3 v_normal;\n\
			void main() {\n\
			  gl_FragColor = vec4(abs(v_normal),1.0);\n\
			}\
		');

		this._uv_shader = new GL.Shader('\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec3 v_pos;\n\
			uniform mat4 u_model;\n\
			uniform mat4 u_mvp;\n\
			void main() {\n\
				v_pos = (u_model * vec4(a_vertex,1.0)).xyz;\n\
				gl_Position = vec4(a_coord * 2.0 - vec2(1.0),0.0,1.0);\n\
			}\
			','\
			precision mediump float;\n\
			uniform vec4 u_color;\n\
			void main() {\n\
			  gl_FragColor = u_color;\n\
			}\
		');

		this._normal_cloud_shader = new GL.Shader('\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec3 a_normal;\n\
			varying vec3 v_color;\n\
			uniform mat4 u_model;\n\
			uniform mat4 u_mvp;\n\
			void main() {\n\
				v_color = abs(a_normal);\n\
				gl_Position = u_mvp * vec4(a_normal,1.0);\n\
				gl_PointSize = 4.0;\n\
			}\
			','\
			precision mediump float;\n\
			varying vec3 v_color;\n\
			uniform vec4 u_color;\n\
			void main() {\n\
			  gl_FragColor = vec4(v_color,1.0);\n\
			}\
		');

		this._cubemap_shader = new GL.Shader('\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 v_coord;\n\
			uniform mat4 u_mvp;\n\
			void main() {\n\
				v_coord = a_coord;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			','\
			precision mediump float;\n\
			varying vec2 v_coord;\n\
			uniform vec4 u_color;\n\
			uniform float u_rotation;\n\
			uniform samplerCube u_texture;\n\
			void main() {\n\
			  vec2 coord = v_coord * 2.0 - vec2(1.0);\n\
			  float dist = length(coord);\n\
			  if(dist > 1.1)\n\
			  {\n\
			  	gl_FragColor = vec4(0.0,0.0,0.0,1.0);\n\
			  	return;\n\
			  }\n\
			  if(dist > 0.99)\n\
			  	discard;\n\
			  vec3 dir = normalize(vec3( coord, 0.5 ));\n\
			  float c = cos(u_rotation);\n\
			  float s = sin(u_rotation);\n\
			  dir = vec3(dir.x * c - dir.z * s, dir.y, dir.x * s + dir.z * c);\n\
			  vec4 tex = textureCube(u_texture, dir);\n\
			  if(tex.a < 0.1)\n\
				discard;\n\
			  gl_FragColor = u_color * tex;\n\
			}\
		');

		//for shadowmaps
		this._depth_shader = new GL.Shader('\
			precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 v_coord;\n\
			uniform mat4 u_mvp;\n\
			void main() {\n\
				v_coord = a_coord;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			','\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform vec2 u_near_far;\n\
			uniform float u_exposure;\n\
			uniform sampler2D u_texture;\n\
			void main() {\n\
				vec2 coord = v_coord;\n\
				float depth = texture2D( u_texture, coord ).x * 2.0 - 1.0;\n\
				float zNear = u_near_far.x;\n\
				float zFar = u_near_far.y;\n\
				float z = zNear * (depth + 1.0) / (zFar + zNear - depth * (zFar - zNear));\n\
				z *= u_exposure;\n\
			  gl_FragColor = vec4(z,z,z,1.0);\n\
			}\
		');
	},

	render: function()
	{
		if(!this.enabled) 
			return;

		gl.clearColor(0.02,0.02,0.02,1.0);
		gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

		this.camera.setOrthographic(0, gl.canvas.width, gl.canvas.height, 0, -1, 1 );
		this.camera.updateMatrices();

		LS.Draw.push();
		LS.Draw.setCamera( this.camera );
		LS.Draw.setColor([1,1,1,1]);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);

		var ctx = gl; //nicer

		ctx.start2D(); //WebGLtoCanvas2D
		ctx.save();
		ctx.scale( this.scale, this.scale );
		ctx.translate( this.offset[0], this.offset[1] );

		ctx.fillStyle = "#444";
		ctx.font = "80px Arial";
		ctx.fillText( this.mode, 0, -40 );

		var total = 0;

		if(this.mode == "textures")
			total = this.renderTextures();
		else if (this.mode == "meshes")
			total = this.renderMeshes();
		else if (this.mode == "materials")
			total = this.renderMaterials();

		ctx.fillStyle = "#333";
		ctx.font = "40px Arial";
		ctx.fillText( total + " items", 400, -40 );

		gl.restore();
		gl.finish2D(); //WebGLtoCanvas2D
		LS.Draw.pop();
		return true;
	},

	renderTextures: function()
	{
		var posx = 0;
		var posy = 10;
		var size = 200;
		var margin = 20;
		gl.strokeStyle = "gray";
		gl.fillStyle = "white";
		gl.textAlign = "left";
		gl.font = "14px Arial";

		this.items.length = 0;

		var num = 0;
		var textures = [];

		for(var i in LS.RM.textures)
		{
			var item = LS.RM.textures[i];
			if(!item || item._is_internal)
				continue;
			textures.push(item);
		}

		var channel = 1;
		switch( this.channels )
		{
			case "R": channel = 0; break;
			case "G": channel = 1; break;
			case "B": channel = 2; break;
			case "A": channel = 3; break;
			default: channel = -1; break;
		}
		this._channel_shader.uniforms({ u_channel: channel, u_exposure: this.exposure });

		textures = textures.concat( gl._texture_pool );

		for(var i = 0; i < textures.length; ++i)
		{
			var item = textures[i];
			if(!item)
				continue;
			var filename = item.filename || "";

			//is a thumbnail texture
			if(filename.substr(0,4) == "_th_" || item.is_preview )
				continue;

			num++;
			var tex = item;
			var w = size * tex.width / tex.height;
			var h = size;

			var startx = gl._matrix[6] + (posx) * gl._matrix[0];
			var starty = gl.canvas.height - gl._matrix[7] + (-posy - h) * gl._matrix[4];
			var sizex = w * gl._matrix[0];
			var sizey = h * gl._matrix[4];

			/*
			var startx = posx;
			var starty = posy;
			var sizex = w;
			var sizey = h;
			*/

			var white = [1,1,1,1];
			var black = [0,0,0,1];

			//inside camera
			if(startx <= gl.canvas.width && starty <= gl.canvas.height && 
				startx + sizex > 0 && starty + sizey > 0 )
			{
				if(tex.texture_type == gl.TEXTURE_2D)
				{
					//LS.Draw.renderPlane([posx + size*0.6, posy + size*0.6, 0], [size*0.5,-size*0.5], tex );
					if( tex.format == GL.DEPTH_COMPONENT ) //depth
					{
						gl.disable( gl.BLEND );
						this._depth_shader.uniforms({ u_near_far: tex.near_far_planes, u_exposure: this.exposure });
						LS.Draw.renderPlane([ gl._matrix[6] + (posx + w*0.5) * gl._matrix[0], gl._matrix[7] + (posy + h*0.5) * gl._matrix[4], 0], [ w*0.5 * gl._matrix[0], -h*0.5 * gl._matrix[4] ], tex, this._depth_shader );
					}
					else //color
					{
						if(this.channels == "RGBA")
							gl.enable( gl.BLEND );
						else 
							gl.disable( gl.BLEND );
						LS.Draw.renderPlane([ gl._matrix[6] + (posx + w*0.5) * gl._matrix[0], gl._matrix[7] + (posy + h*0.5) * gl._matrix[4], 0], [ w*0.5 * gl._matrix[0], -h*0.5 * gl._matrix[4] ], tex, this._channel_shader );
					}
					gl.enable( gl.BLEND );
				}
				else if(tex.texture_type == gl.TEXTURE_CUBE_MAP)//cubemaps
				{
					this._cubemap_shader.uniforms({u_rotation: getTime() * 0.001 });
					LS.Draw.renderPlane([ gl._matrix[6] + (posx + w*0.5) * gl._matrix[0], gl._matrix[7] + (posy + h*0.5) * gl._matrix[4], 0], [ w*0.5 * gl._matrix[0], -h*0.5 * gl._matrix[4] ], tex, this._cubemap_shader );
				}

				var text = filename.substr(0,24);
				if(this.settings.render_frame)
				{
					gl.globalAlpha = (this.selected_item && this.selected_item.item == item) ? 1 : 0.5;
					gl.strokeRect( posx, posy, w, h );
					gl.globalAlpha = 1;
				}
				if(this.settings.render_filename && this.show_name)
				{
					gl.fillColor = black;
					gl.fillText(text,posx + 6,posy + 16);
					gl.fillColor = white;
					gl.fillText(text,posx + 5,posy + 15);
				}
				this.items.push({id:i,type:"Texture",item: tex, x:posx,y:posy,w:w,h:h});
			}

			posx += w + margin;
			if(posx > gl.canvas.width - size + margin)
			{
				posx = 0;
				posy += h + margin;
			}
		}
		return num;
	},

	renderMeshes: function()
	{
		var posx = 0;
		var posy = 10;
		var size = 200;
		var margin = 20;
		gl.strokeStyle = "gray";
		gl.fillStyle = "white";
		gl.textAlign = "left";
		gl.font = "14px Arial";

		var mesh_camera = this._mesh_camera;
		if(!mesh_camera)
			mesh_camera = this._mesh_camera = new LS.Camera();

		var old_viewport = gl.getViewport();

		var matrix = mat4.create();
		if( this.rotate )
		{
			if(this.meshes_axis == "Y")
				mat4.rotateY( matrix, matrix, getTime() * 0.0005 );
			else
				mat4.rotateZ( matrix, matrix, getTime() * 0.0005 );
		}

		this.items.length = 0;
		var shader = null;
		if( this.meshes_mode.indexOf("phong") != -1 )
			shader = LS.Draw.shader_phong;
		var wireframe_shader = null;
		if( this.meshes_mode.indexOf("wireframe") != -1 )
			wireframe_shader = LS.Draw.shader;
		var blend = false;
		var primitive = gl.TRIANGLES;
		if( this.meshes_mode == "X-RAY" )
		{
			shader = LS.Draw.shader;
			LS.Draw.setColor(0.05,0.05,0.05,1);
			blend = true;
		}
		else if( this.meshes_mode == "normal" )
			shader = this._normal_shader;
		else if( this.meshes_mode == "Normal Cloud" )
		{
			shader = this._normal_cloud_shader;
			LS.Draw.setColor(1,1,1,1);
			primitive = gl.POINTS;
		}
		else if( this.meshes_mode == "UV_wireframe" )
		{
			shader = this._uv_shader;
			wireframe_shader = this._uv_shader;
			LS.Draw.setColor(0.2,0.2,0.2,1);
			blend = true;
		}

		gl.depthFunc( gl.LEQUAL );

		var num = 0;
		for(var i in LS.RM.meshes)
		{
			var item = LS.RM.meshes[i];
			if(!item)
				continue;

			num++;
			var mesh = item;
			var w = size;
			var h = size;

			var startx = gl._matrix[6] + (posx) * gl._matrix[0];
			var starty = gl.canvas.height - gl._matrix[7] + (-posy - h) * gl._matrix[4];
			var sizex = w * gl._matrix[0];
			var sizey = h * gl._matrix[4];

			//inside camera
			if(startx <= gl.canvas.width && starty <= gl.canvas.height && 
				startx + sizex > 0 && starty + sizey > 0 )
			{
				//move camera to bounding area
				var bounding = mesh.bounding;
				var halfsize = BBox.getHalfsize( bounding );
				var center = BBox.getCenter( bounding );
				var radius = vec3.length( halfsize );
				if(shader == this._normal_cloud_shader)
				{
					radius = 2;
					center = null;
				}
				mesh_camera.setPerspective( 45,1,0.1,radius * 4 );

				if(this.meshes_axis == "Y")
					mesh_camera.lookAt([ 0, radius * 0.5, radius * 2 ],[0,0,0],[0,1,0]);
				else
					mesh_camera.lookAt([ radius * 0.5, radius * 2, 0 ],[0,0,0],[0,0,1]);

				LS.Draw.pushCamera();
				LS.Draw.setCamera( mesh_camera );
				LS.Draw.setMatrix( matrix );

				if(center)
					LS.Draw.translate( -center[0], -center[1], -center[2]);

				gl.viewport( startx, starty, sizex, sizey );

				if(blend)
				{
					gl.enable( gl.BLEND );
					gl.blendFunc( gl.ONE, gl.ONE );
					gl.disable( gl.DEPTH_TEST );
				}
				else
				{
					gl.disable( gl.BLEND );
					gl.enable( gl.DEPTH_TEST );
				}

				if(this.cull_face)
					gl.enable( gl.CULL_FACE );
				else
					gl.disable( gl.CULL_FACE );

				if(shader)
					LS.Draw.renderMesh( mesh, primitive, shader );
				gl.enable( gl.BLEND );

				if( wireframe_shader && mesh.vertexBuffers["vertices"] ) //wireframe
				{
					if(!mesh.indexBuffers["wireframe"])
						mesh.computeWireframe();
					LS.Draw.renderMesh( mesh, gl.LINES, wireframe_shader, "wireframe" );
				}

				gl.setViewport( old_viewport );
				LS.Draw.popCamera();

				gl.disable( gl.DEPTH_TEST );
				gl.disable( gl.CULL_FACE );
				gl.enable( gl.BLEND );
				gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
				var filename = LS.RM.getFilename(i).substr(0,24);
				var text = filename;
				gl.globalAlpha = (this.selected_item && this.selected_item.item == item) ? 1 : 0.5;
				gl.strokeRect( posx, posy, w, h );
				gl.globalAlpha = 1;
				if(this.settings.render_filename && this.show_name)
					gl.fillText(text,posx + 5,posy + 15);
				this.items.push({id:i,type:"Mesh",item: mesh, x:posx,y:posy,w:w,h:h});
			}

			posx += w + margin;
			if(posx > gl.canvas.width - size + margin)
			{
				posx = 0;
				posy += h + margin;
			}
		}


		gl.depthFunc( gl.LESS );

		return num;
	},

	renderMaterials: function()
	{
		var posx = 0;
		var posy = 10;
		var size = 200;
		var margin = 20;
		gl.strokeStyle = "gray";
		gl.fillStyle = "white";
		gl.textAlign = "left";
		gl.font = "14px Arial";

		LS.Draw.reset_stack_on_reset = false;

		var old_viewport = gl.getViewport();
		var angle = 0;
		if( this.rotate )
			angle = getTime() * 0.0005;

		this.items.length = 0;
		var num = 0;
		for(var i in LS.RM.materials)
		{
			var item = LS.RM.materials[i];
			num++;
			var material = item;
			var w = size;
			var h = size;

			var startx = gl._matrix[6] + (posx) * gl._matrix[0];
			var starty = gl.canvas.height - gl._matrix[7] + (-posy - h) * gl._matrix[4];
			var sizex = w * gl._matrix[0];
			var sizey = h * gl._matrix[4];

			if(startx <= gl.canvas.width && starty <= gl.canvas.height && 
				startx + sizex > 0 && starty + sizey > 0 )
			{
				gl.viewport( startx, starty, sizex, sizey );

				//render
				RenderModule.renderMaterialPreview( material, 1, { to_viewport: true, background_color: [0.1,0.1,0.1,1.0], rotate: angle } );

				gl.setViewport( old_viewport );

				gl.disable( gl.DEPTH_TEST );
				gl.enable( gl.BLEND );
				gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );

				var filename = LS.RM.getFilename(i).substr(0,24);
				var text = filename;
				gl.globalAlpha = (this.selected_item && this.selected_item.item == item) ? 1 : 0.5;
				gl.strokeRect( posx, posy, w, h );
				gl.globalAlpha = 1;
				if(this.settings.render_filename && this.show_name)
					gl.fillText(text,posx + 5,posy + 15);

				this.items.push({id:i, item: material, type:"Material",x:posx,y:posy,w:w,h:h});
			}

			posx += w + margin;
			if(posx > gl.canvas.width - size + margin)
			{
				posx = 0;
				posy += h + margin;
			}
		}
		return num;
	},

	mousedown: function(e)
	{
		if(	(getTime() - this._last_mouseup) < 200 && this.selected_item ) //dblclick
			EditorModule.inspect( this.selected_item.item );

		return true;
	},

	mouseup: function(e)
	{
		if(e.click_time < 200)
		{
			this.selected_item = this.getItemAtPos(e.mousex, e.mousey);
			this._last_mouseup = getTime(); //for dblclick
		}
		return true;
	},

	mousemove: function(e)
	{
		if(e.dragging)
		{
			this.offset[0] += e.deltax / this.scale;
			this.offset[1] += e.deltay / this.scale;
		}

		return true;
	},
		
	mousewheel: function(e)
	{
		if(!this.enabled)
			return;

		this.changeScale( this.scale * (e.wheel > 0 ? 1.1 : 0.9), [e.canvasx, gl.canvas.height - e.canvasy] );
		e.stopPropagation();
		return true;
	},

	getItemAtPos: function(x,y)
	{
		var pos = this.convertOffsetToCanvas([x,y]);
		x = pos[0];
		y = pos[1];
		for( var i = 0; i < this.items.length; ++i)
		{
			var item = this.items[i];
			if( item.x < x && item.y < y && 
				x < (item.x + item.w) && y < (item.y + item.h))
				return item;
		}
		return null;
	},

	convertOffsetToCanvas: function(pos)
	{
		return [pos[0] / this.scale - this.offset[0], pos[1] / this.scale - this.offset[1]];
	},

	convertCanvasToOffset: function(pos)
	{
		return [(pos[0] + this.offset[0]) * this.scale, 
			(pos[1] + this.offset[1]) * this.scale ];
	},

	changeScale: function(value, zooming_center)
	{
		zooming_center = zooming_center || [gl.canvas.width * 0.5,gl.canvas.height * 0.5];
		var center = this.convertOffsetToCanvas( zooming_center );
		this.scale = value;

		var new_center = this.convertOffsetToCanvas( zooming_center );
		var delta_offset = [new_center[0] - center[0], new_center[1] - center[1]];

		this.offset[0] += delta_offset[0];
		this.offset[1] += delta_offset[1];
	}

};


CORE.registerModule( LabModule );