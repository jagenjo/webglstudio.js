var MeshPainter = {
	enabled: false,
	name: "MeshPainter",

	collision_pos: vec3.create(),
	last_collision_pos: null,
	_mouse_over_the_mesh: false,

	current_texture: null,
	settings: {
		channel: "color",
		uvs: "0",
		tex_size: 512,
		bg_color: [0,0,0],
	},

	brush: {
		color: vec3.fromValues(1,1,1),
		alpha: 1,
		size: 1,
		channels: [1,1,1,1],
		spread: 0,
		texture: null,
		blending: false
	},

	pending_sprites: [],
	pending_sprites3D: [],

	init: function()
	{
		LiteGUI.menubar.add("Actions/Paint mesh", { callback: function() { 
			MeshPainter.showPaintingDialog();
		}});

		this.uniforms = {
			u_model: mat4.create(),
			u_vp: mat4.create(),
			u_brushpos: vec3.create(),
			u_brushpos2: vec3.create(),
			u_brushsize: 1.0,
			u_brushcolor: vec4.create(),
			u_brushtexture: 0
		}

			LEvent.bind( LS.GlobalScene, "clear", function(){
				MeshPainter.setPaintedNode(null);
			});
	},

	setPaintedNode: function(node)
	{
		this.painted_node = node;
		if(!node) return;

		this.collision_mesh = node.getLODMesh() || node.getMesh();
		this.painted_mesh = node.getMesh();

		if(!this.collision_mesh)
			return;

		if(!this.collision_mesh.octree)
			this.collision_mesh.octree = new Octree( this.collision_mesh );

		this.updateChannel( this.settings.channel );
	},

	getPaintedNode: function()
	{
		return this.painted_node;
	},

	showPaintingDialog: function()
	{
		if(this.dialog)
			this.dialog.close();

		var dialog = new LiteGUI.Dialog("dialog_mesh_painter", {title:"Mesh Painter", parent:"#visor", close: true, minimize: true, width: 300, height: 440, scroll: false, draggable: true});
		dialog.show('fade');
		dialog.setPosition(100,100);
		this.dialog = dialog;

		var widgets = new LiteGUI.Inspector("painting_widgets",{ name_width: "50%" });
		widgets.onchange = function()
		{
			RenderModule.requestFrame();
		}

		inner_update();

		function inner_update()
		{
			widgets.clear();

			widgets.addTitle("Node");

			widgets.addButton("Select node","Paint this node" , { callback: function (value) { 
				var node = SelectionModule.getSelectedNode();
				if(!node)
				{
					LiteGUI.alert("No node selected");
					return;
				}				
				MeshPainter.setPaintedNode( node );
				inner_update();
			}});

			if(!MeshPainter.painted_node)
			{
				widgets.addButton("", "Close" , { callback: function (value) { 
					dialog.close(); 
				}});

				dialog.adjustSize();
				return;
			}

			var node = MeshPainter.painted_node;
			var material = node.getMaterial();

			//create material
			if(!material)
			{
				var selected_material_class = LS.Material;
				widgets.addInfo(null,"Material not found in object");
				widgets.addCombo("MaterialClasses", "Material", { values: LS.MaterialClasses, callback: function(material_class) { 
					selected_material_class = material_class;
				}});

				widgets.addButton("No material", "Create Material", function(){
					var mat = new selected_material_class();
					node.setMaterial( mat );
					inner_update();
				});
				dialog.adjustSize(10);
				return;
			}

			widgets.addButton("Update mesh","Update" , { callback: function (value) { 
				if(!Scene.selected_node)
				{
					LiteGUI.alert("No node selected");
					return;
				}				
				MeshPainter.setPaintedNode( MeshPainter.painted_node );
				inner_update();
			}});

			//get valid texture channels
			var channels = material.getTextureChannels();
			if( channels.indexOf( MeshPainter.settings.channel ) == -1 )
				MeshPainter.settings.channel = channels[0];

			widgets.addInfo("Node name", MeshPainter.painted_node.id );

			widgets.addTitle("Target");

			widgets.addInfo("Current", MeshPainter.settings.channel );
			widgets.addCombo("Channel", MeshPainter.settings.channel, { values: channels, callback: function(v) { 
				MeshPainter.updateChannel(v);
				inner_update();
			}});

			var channel_sampler = material.getTextureSampler( MeshPainter.settings.channel );
			var texture = material.getTexture( MeshPainter.settings.channel );
			if(!channel_sampler || !texture)
			{
				widgets.addInfo(null, "No "+MeshPainter.settings.channel+" texture found, create one?" );
				var tex_name = "texture_" + (Math.random() * 1000).toFixed();
				//widgets.addTitle("New texture");
				widgets.addString("Texture name", tex_name, { callback: function (value) { tex_name = value }});
				widgets.addCombo("Texture Size", MeshPainter.settings.tex_size, { values:[64,128,256,512,1024,2048,4096], callback: function (value) { MeshPainter.settings.tex_size = value }});
				widgets.addColor("Bg Color", MeshPainter.settings.bg_color, { callback: function (value) { MeshPainter.settings.bg_color = value }});
				widgets.addButton("","Create texture" , { callback: function (value) { 
					MeshPainter.createTexture( node, MeshPainter.settings.channel );
					inner_update();
				}});
				widgets.addSeparator();
				widgets.addButton("", "Close" , { callback: function (value) { 
					dialog.close(); 
				}});
				dialog.adjustSize();	
				return;
			}
			else
			{
				widgets.addInfo("Size", texture.width + "x" + texture.height );
				widgets.widgets_per_row = 2;
				widgets.addButton(null,"Clone" , { callback: function (value) { 
					MeshPainter.cloneTextureInChannel();
					inner_update();
				}});

				widgets.addButton(null,"Remove" , { callback: function (value) { 
					material.setTexture( MeshPainter.settings.channel, null );
					inner_update();
				}});
				widgets.widgets_per_row = 1;
			}

			/*
			widgets.addCombo("Texture coords", MeshPainter.settings.uvs, { values: Material.TEXTURE_COORDINATES, callback: function(v) {
				MeshPainter.settings.uvs = v;
			}});
			*/

			//Brush info
			widgets.addTitle("Brush");
			widgets.addNumber("Size", MeshPainter.brush.size, { min:0.1, step: 0.1, callback: function(v) { 
				MeshPainter.brush.size = v;
			}});
			//widgets.addNumber("Spread", MeshPainter.brush.spread, { min:0.1, step: 0.1, callback: function(v) { MeshPainter.brush.spread = v; }});
			widgets.addSlider("Alpha", MeshPainter.brush.alpha, { min:0.01, max: 1, callback: function(v) { 
				MeshPainter.brush.alpha = v;
			}});
			var widget_color = widgets.addColor("Color", MeshPainter.brush.color, { callback: function (value) { vec3.copy( MeshPainter.brush.color, value ); }});
			widgets.addCheckbox("Blending", MeshPainter.brush.blending, { callback: function(v) { MeshPainter.brush.blending = v; }});

			widgets.widgets_per_row = 4;
			widgets.addInfo( "Mask", null, { width: 130 } );
			widgets.addCheckbox( null, MeshPainter.brush.channels[0], { label: "R", width: 40, callback: function (value) { MeshPainter.brush.channels[0] = value?1:0; }});
			widgets.addCheckbox( null, MeshPainter.brush.channels[1], { label: "G", width: 40, callback: function (value) { MeshPainter.brush.channels[1] = value?1:0; }});
			widgets.addCheckbox( null, MeshPainter.brush.channels[2], { label: "B", width: 40, callback: function (value) { MeshPainter.brush.channels[2] = value?1:0; }});
			widgets.addCheckbox( null, MeshPainter.brush.channels[3], { label: "A", width: 40, callback: function (value) { MeshPainter.brush.channels[3] = value?1:0; }});
			widgets.widgets_per_row = 1;

			widgets.addButton("Special color","Flat Normal", { callback: function (value) { 
				widget_color.setValue( [0.5,0.5,1.0] );
				//vec3.copy( MeshPainter.brushcolor, [0.5,0.5,1.0] ); 
			}});

			widgets.addSeparator();
			widgets.addButton("", "Close" , { callback: function (value) { 
				dialog.close(); 
			}});
			dialog.adjustSize();	

		}//inner update


		$(dialog.content).append(widgets.root);
		dialog.adjustSize();		

		//widgets.addString("Name", last_file ? last_file.name : "");
	},

	cloneTextureInChannel: function()
	{
		if(!MeshPainter.getPaintedNode())
			return;

		var node = MeshPainter.getPaintedNode();

		var material = node.getMaterial();
		if(!material)
			return;
		var current_texture = material.getTexture( MeshPainter.settings.channel );
		if( !current_texture )
			return;

		var tex = new GL.Texture.fromTexture( current_texture, { minFilter: gl.LINEAR });
		var ext = current_texture.filename.substring( current_texture.filename.lastIndexOf(".") );
		var pos = current_texture.filename.lastIndexOf("/");
		var name = current_texture.filename;
		if(pos != -1)
			name = current_texture.filename.substring( pos+1 );
		tex.filename = name.replace(ext, "_copy_" + (Math.random() * 1000).toFixed(0) + "_.png");
		LS.ResourcesManager.registerResource( tex.filename, tex );
		material.setTexture( MeshPainter.settings.channel, tex );
		this.updateChannel();
	},

	updateChannel: function(channel)
	{
		this.settings.channel = channel;

		var node = MeshPainter.getPaintedNode();
		if(!node)
			return;

		var mat = node.getMaterial();
		if(!mat) 
			return;

		this.current_texture = mat.getTexture( channel );
		if(!this.current_texture)
			return;

		//disable mipmaps
		var texture = this.current_texture;
		texture.bind();
		gl.texParameteri(texture.texture_type, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
		texture.unbind();

		//mat.textures[channel + "_uvs"] = uvs || "0";
		EditorModule.refreshAttributes();
	},

	createTexture: function(node, channel, name)
	{
		var tex_size = this.settings.tex_size || 512;
		this.current_texture = new GL.Texture(tex_size,tex_size, { format: gl.RGB, magFilter: gl.LINEAR, minFilter: gl.LINEAR_MIPMAP_LINEAR });
		var tex_name = name || "texture_" + (Math.random() * 1000).toFixed();
		tex_name = tex_name + ".png"; //used for storing later
		this.current_texture.filename = tex_name;
		this.current_texture.bind();
		gl.generateMipmap(this.current_texture.texture_type);
		gl.texParameteri(this.current_texture.texture_type, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
		this.current_texture.unbind();

		ResourcesManager.registerResource(tex_name, this.current_texture);

		var mat = node.getMaterial();
		if(!mat)
		{
			mat = new Material();
			node.material = mat;
		}

		mat.setTexture(channel, tex_name);
		var bg_color = this.settings.bg_color || [1,1,1];
		this.current_texture.drawTo( function() {
			gl.clearColor(bg_color[0],bg_color[1],bg_color[2],1);
			gl.clear( gl.COLOR_BUFFER_BIT );
		});

		RenderModule.requestFrame();
		EditorModule.inspectNode( node );
	},

	//*********************
	testRay: function(ray)
	{
		if(!this.painted_node || !this.collision_mesh || !this.collision_mesh.octree) return null;

		var node = this.painted_node;

		//compute ray
		var model = node.transform.getGlobalMatrix();
		var inv = mat4.invert( mat4.create(), model );
		mat4.multiplyVec3(ray.start, inv, ray.start );
		mat4.rotateVec3(ray.direction, inv, ray.direction );
		vec3.normalize(ray.direction, ray.direction);

		//test hit
		var hit = this.collision_mesh.octree.testRay( ray.start, ray.direction, 0.0, 10000 );
		if(hit)
		{
			mat4.multiplyVec3(hit.pos, model, hit.pos);
			return hit;
		}
		return null;
	},

	getCamera: function()
	{
		return RenderModule.under_camera || RenderModule.camera;
	},

	addSprite3D: function(pos, normal, use_line)
	{
		var sprite = {
			pos: pos,
			normal: normal,
			color: vec3.clone( this.brush.color ),
			alpha: this.brush.alpha,
			size: this.brush.size
		};

		/*
		if(use_line)
		{
			if(this.last_collision_pos != null)
			{
				var d = pos.subtract( this.last_collision_pos ).length();
				if( d > 10 )
					sprite.pos2 = this.last_collision_pos;
			}
			this.last_collision_pos = vec3.create(pos);
		}
		*/

		this.pending_sprites3D.push( sprite );
	},

	drawSprites3D: function()
	{
		if(this.pending_sprites3D.length == 0)
			return;

		gl.enable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);

		if(this.brush.blending)
			gl.blendFuncSeparate( gl.SRC_ALPHA, gl.ONE, gl.SRC_ALPHA, gl.DST_ALPHA );
		else
			gl.blendFuncSeparate( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.SRC_ALPHA, gl.DST_ALPHA );
		gl.blendEquation( gl.FUNC_ADD, gl.MAX );

		gl.colorMask( MeshPainter.brush.channels[0], MeshPainter.brush.channels[1], MeshPainter.brush.channels[2], MeshPainter.brush.channels[3]);

		var camera = this.getCamera();

		LS.Renderer.enableCamera( camera, null, true );
		var mesh = this.painted_mesh;
		var uniforms = MeshPainter.uniforms;

		var shader_point = this._shader;
		if(!shader_point)
			shader_point = this._shader_point = new GL.Shader( MeshPainter._paint_vertex_shader, MeshPainter._paint_pixel_shader); //,{"USE_PAINT_LINE":""});

		var shader_line = this._shader_line;
		if(!shader_line)
			shader_line = this._shader_line = new GL.Shader( MeshPainter._paint_vertex_shader, MeshPainter._paint_pixel_shader,{"USE_PAINT_LINE":""});

		var shader = null;
		var model = this.getPaintedNode().transform.getGlobalMatrix();


		for(var i in this.pending_sprites3D)
		{
			var sprite = this.pending_sprites3D[i];

			uniforms.u_model.set( model );
			uniforms.u_brushpos.set( sprite.pos );
			if(sprite.pos2)
				uniforms.u_brushpos2.set( sprite.pos2 );
			uniforms.u_brushsize = sprite.size;
			uniforms.u_brushcolor.set( sprite.color );
			uniforms.u_brushcolor[3] = sprite.alpha;

			if(sprite.pos2)
				shader = shader_line;
			else
				shader = shader_point;

			shader.uniforms(uniforms);
			shader.draw( mesh );
		}

		this.pending_sprites3D = [];

		//restore state
		gl.disable(gl.BLEND);
		gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		gl.blendFuncSeparate( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ZERO );
		gl.blendEquation( gl.FUNC_ADD, gl.FUNC_ADD );
		gl.colorMask(1,1,1,1);
	},
};

MeshPainter._paint_vertex_shader = "\n\
	precision highp float;\n\
	\n\
	attribute vec3 a_vertex;\n\
	attribute vec2 a_coord;\n\
	\n\
	uniform mat4 u_model;\n\
	varying vec3 v_pos;\n\
	\n\
	void main() {\n\
		v_pos = (u_model * vec4(a_vertex,1.0)).xyz;\n\
		gl_Position = vec4(a_coord * 2.0 - 1.0, 0.0, 1.0);\n\
	}\n\
	";

MeshPainter._paint_pixel_shader = "\n\
	precision highp float;\n\
	\n\
	varying vec3 v_pos;\n\
	uniform vec3 u_brushpos;\n\
	#ifdef USE_PAINT_LINE\n\
		uniform vec3 u_brushpos2;\n\
		\n\
		float distToLine(vec3 P, vec3 A, vec3 B)\n\
		{\n\
			float dist_A = length(P-A);\n\
			float dist_B = length(P-B);\n\
			float dist_line = length( cross( P-A, P-B ) ) / length(B-A);\n\
			return min(dist_line, min(dist_A, dist_B) );\n\
		}\n\
	#endif\n\
	\n\
	uniform float u_brushsize;\n\
	uniform vec4 u_brushcolor;\n\
	void main() {\n\
	\n\
		#ifdef USE_PAINT_LINE\n\
			float dist = distToLine(v_pos, u_brushpos, u_brushpos2);\n\
		#else\n\
			vec3 v = v_pos - u_brushpos;\n\
			if( abs(v.x) > u_brushsize || abs(v.y) > u_brushsize)\n\
				discard;\n\
			\n\
			float dist = length(v);\n\
			if( dist > u_brushsize )\n\
				discard;\n\
		#endif\n\
		\n\
		vec4 color = u_brushcolor;\n\
		color.a *= 1.0 - (dist / u_brushsize);\n\
		gl_FragColor = color;\n\
	}\n\
";

MeshPainter._brush_vertex_shader = "\n\
	precision highp float;\n\
	\n\
	attribute vec3 a_vertex;\n\
	\n\
	uniform mat4 u_model;\n\
	uniform mat4 u_vp;\n\
	varying vec3 v_pos;\n\
	\n\
	void main() {\n\
		v_pos = (u_model * vec4(a_vertex,1.0)).xyz;\n\
		gl_Position = u_vp * vec4(v_pos,1.0);\n\
	}\n\
	";

MeshPainter._brush_pixel_shader = "\n\
	precision highp float;\n\
	\n\
	varying vec3 v_pos;\n\
	uniform vec3 u_brushpos;\n\
	uniform float u_brushsize;\n\
	uniform vec4 u_brushcolor;\n\
	void main() {\n\
		vec3 v = v_pos - u_brushpos;\n\
		if( abs(v.x) > u_brushsize || abs(v.y) > u_brushsize)\n\
			discard;\n\
		\n\
		float dist = length(v);\n\
		if( dist > u_brushsize )\n\
			discard;\n\
		\n\
		vec4 color = u_brushcolor;\n\
		color.a *= 1.0 - (dist / u_brushsize);\n\
		gl_FragColor = color;\n\
	}\n\
";

LiteGUI.registerModule( MeshPainter );

var meshPainterTool = {
	name: "painter",
	description: "Paint the mesh",
	section: "modify",
	icon: "media/icons/mini-icon-brush.png",

	onEnable: function()
	{
		if(!MeshPainter.sphere_mesh)
			MeshPainter.sphere_mesh = GL.Mesh.sphere({long:16,lat:16});

		//disable
		if(MeshPainter.current_texture)
		{
			var texture = MeshPainter.current_texture;
			texture.bind();
			gl.texParameteri(texture.texture_type, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
			texture.unbind();
		}
	},

	onDisable: function()
	{
		if(MeshPainter.current_texture)
		{
			var texture = MeshPainter.current_texture;
			texture.bind();
			gl.texParameteri(texture.texture_type, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR );
			gl.generateMipmap(texture.texture_type);
			texture.unbind();
		}
	},

	onClick: function()
	{
		MeshPainter.showPaintingDialog();
	},

	render: function()
	{
		if(!RenderModule.frame_updated || !MeshPainter.current_texture)
			return;

		var camera = MeshPainter.getCamera();

		//Draw.setViewProjectionMatrix( Renderer._view_matrix, Renderer._projection_matrix, Renderer._viewprojection_matrix );
		Draw.setCamera( camera );
		var uniforms = MeshPainter.uniforms;

		MeshPainter.uniforms.u_vp.set( camera._viewprojection_matrix );

		gl.disable( gl.BLEND );
		gl.enable( gl.DEPTH_TEST );

		if(MeshPainter.sphere_mesh && MeshPainter._mouse_over_the_mesh)
		{
			var shader_brush = this._shader_brush;
			if(!shader_brush)
				shader_brush = this._shader_brush = new GL.Shader( MeshPainter._brush_vertex_shader, MeshPainter._brush_pixel_shader); 
			var model = MeshPainter.getPaintedNode().transform.getGlobalMatrix();

			gl.enable( gl.BLEND );
			gl.depthFunc( gl.LEQUAL );
			gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );

			uniforms.u_model.set( model );
			uniforms.u_brushpos.set( MeshPainter.collision_pos );
			uniforms.u_brushsize = MeshPainter.brush.size;
			uniforms.u_brushcolor.set( MeshPainter.brush.color );
			uniforms.u_brushcolor[3] = MeshPainter.brush.alpha * 3.0;

			Draw.push();
			Draw.setMatrix( model );
			shader_brush.uniforms( uniforms );
			Draw.renderMesh( MeshPainter.painted_mesh, gl.TRIANGLES, shader_brush );
			Draw.pop();

			gl.depthFunc( gl.LESS );

			if(1) //render brush sphere
			{
				Draw.setColor( MeshPainter.brush.color );
				Draw.setAlpha(0.1);
				Draw.push();
				Draw.translate( MeshPainter.collision_pos );
				Draw.scale( [MeshPainter.brush.size, MeshPainter.brush.size, MeshPainter.brush.size] );
				Draw.renderMesh( MeshPainter.sphere_mesh, gl.TRIANGLES );
				Draw.pop();
			}
			gl.disable( gl.BLEND );
		}



		if( MeshPainter.pending_sprites.length > 0 || MeshPainter.pending_sprites3D.length > 0 )
		{
			MeshPainter.current_texture.drawTo(function(tex) {
				//texturePainter.drawSprites();
				MeshPainter.drawSprites3D();
				//texturePainter.drawUnwrap();
			});
		}
	},

	mousedown: function(e)
	{
		if(e.button != 0) return;

		var node = MeshPainter.getPaintedNode();
		if(!node)
			return;

		var camera = MeshPainter.getCamera();

		MeshPainter.painting = false;
		if(node)
		{
			camera.updateMatrices();
			var ray = camera.getRayInPixel( e.canvasx, e.canvasy );
			var pos = MeshPainter.testRay(ray);
			if(pos)
				MeshPainter.painting = true;
		}
	},

	mousemove: function(e)
	{
		var node = MeshPainter.getPaintedNode();
		if(!node)
			return;

		var camera = MeshPainter.getCamera();
		camera.updateMatrices();
		var node = MeshPainter.painted_node;

		var ray = camera.getRayInPixel( e.canvasx, e.canvasy );
		var hit = MeshPainter.testRay(ray);
		if(hit) {
			MeshPainter._mouse_over_the_mesh = true;
			vec3.copy(MeshPainter.collision_pos, hit.pos ); //used for cursor sphere
		}
		else
			MeshPainter._mouse_over_the_mesh = false;

		RenderModule.requestFrame();

		if(e.button == 0 && e.dragging && MeshPainter.painting)
		{
			if(node && MeshPainter.painted_mesh)
			{
				if(hit)
				{
					MeshPainter.addSprite3D( hit.pos, hit.normal );
				}
			}
			return true;
		}
		else if(e.dragging)
		{
			cameraTool.onCameraDrag(e);
		}
	},

	mouseup: function(e)
	{
		MeshPainter.painting = false;
	},

	mousewheel: function(e)
	{
		if(!e.shiftKey)
			return;

		//console.log(e);
		if(e.wheelDelta > 0)
			MeshPainter.brush.size *= 1.2;
		else
			MeshPainter.brush.size *= 0.8;

		RenderModule.requestFrame();
	},
};

ToolsModule.registerTool(meshPainterTool);
