var TextureTools = {
	init: function()
	{
		LiteGUI.menubar.add("Actions/Texture Tools", { callback: function() { 
			TextureTools.showToolsDialog();
		}});
	},

	showToolsDialog: function( texture_name )
	{
		if(this.dialog)
			this.dialog.close();

		var dialog = new LiteGUI.Dialog( { title:"Texture Tools", close: true, minimize: true, width: 400, height: 440, scroll: false, draggable: true});
		dialog.show();
		dialog.setPosition(100,100);
		this.dialog = dialog;

		var widgets = new LiteGUI.Inspector( { name_width: "30%" } );
		widgets.onchange = function()
		{
			RenderModule.requestFrame();
		}

		inner_update();

		function inner_update()
		{
			var texture = null;
			if( texture_name )
				texture = LS.ResourcesManager.getTexture( texture_name );

			widgets.clear();

			widgets.addTexture("Texture", texture_name || "", { callback: function(v) {
				texture_name = v;
				inner_update();
			}, callback_load: function( res ){
				texture_name = res.filename;
				inner_update();
			}});

			if(texture)
			{
				texture.inspect( widgets, true );
			}
			else
			{
				if(LS.ResourcesManager.isLoading( texture ))
					widgets.addInfo(null, "Loading...");
			}

			widgets.addSeparator();
			widgets.addButton("", "Close" , { callback: function (value) { 
				dialog.close(); 
			}});
			dialog.adjustSize();

		}//inner update

		dialog.add( widgets );
		dialog.adjustSize();		
	},

	shader_presets: {
		nothing: "color.xyz = color.xyz",
		invert: "color.xyz = vec3(1.0) - color.xyz",
		generate_normalmap: "\
float z0 = texture2D(u_texture, uv + vec2(-u_size.z, -u_size.w) ).x;\n\
float z1 = texture2D(u_texture, uv + vec2(0.0, -u_size.w) ).x;\n\
float z2 = texture2D(u_texture, uv + vec2(u_size.z, -u_size.w) ).x;\n\
float z3 = texture2D(u_texture, uv + vec2(-u_size.z, 0.0) ).x;\n\
float z4 = color.x;\n\
float z5 = texture2D(u_texture, uv + vec2(u_size.z, 0.0) ).x;\n\
float z6 = texture2D(u_texture, uv + vec2(-u_size.z, u_size.w) ).x;\n\
float z7 = texture2D(u_texture, uv + vec2(0.0, u_size.w) ).x;\n\
float z8 = texture2D(u_texture, uv + vec2(u_size.z, u_size.w) ).x;\n\
vec3 normal = vec3( z2 + 2.0*z4 + z7 - z0 - 2.0*z3 - z5, z5 + 2.0*z6 + z7 -z0 - 2.0*z1 - z2, 1.0 );\n\
color.xyz = normalize(normal) * 0.5 + vec3(0.5);\n",
		reverse_normalmap: "color.xyz = vec3( 1.0 - color.x, 1.0 - color.y, color.z );",
		constrast: "float contrast = 2.0;\ncolor.xyz = (color.xyz - vec3(0.5)) * contrast + vec3(0.5);"
	},

	showApplyShaderDialog: function( texture )
	{
		if(!texture)
			return;

		var filename = "";
		if(texture)
			filename = texture.fullpath || texture.filename;

		var dialog = new LiteGUI.Dialog( { title:"Apply Shader", close: true, minimize: true, width: 400, height: 540, scroll: false, resizable: true, draggable: true});
		dialog.show();
		dialog.setPosition(100,400);

		var code = "color.xyz = vec3(1.0) - color.xyz";
		var textarea_widget = null;
		var widgets = new LiteGUI.Inspector( { name_width: "50%" } );
		dialog.add( widgets );

		widgets.addTexture("Texture", filename, { callback: function(v){
			filename = v;
			//reload?
		}});

		widgets.addCombo("Presets", "nothing", { values: TextureTools.shader_presets, callback: function(v) {
			textarea_widget.setValue(v);
			code = v;
		}});

		widgets.addTitle("Code");
		widgets.addInfo(null,"vec4 color and vec2 uv");
		textarea_widget = widgets.addCode(null,code,{ height: 200, callback: function(v){
			code = v;
		},callback_keydown: function(e){
			if(e.keyCode == 13 && e.ctrlKey)
			{
				code = e.target.value;
				inner_apply();
				e.preventDefault();
				e.stopPropagation();
			}
		}});

		var error_widget = widgets.addInfo(null," ");

		widgets.addButton(null,"Apply FX", inner_apply );
		widgets.addButton(null,"Restore Original", inner_restore );

		dialog.show();
		dialog.adjustSize();		

		var clone = null;
		var backup = null;
		var shader = null;

		function inner_apply()
		{
			try
			{
				shader = GL.Shader.createFX( code, "uniform vec4 u_size;\n", shader );
			}
			catch (err)
			{
				console.error(err);
				error_widget.setValue("Error: " + err );
				dialog.adjustSize();	//otherwise the button is left outside	
				return;
			}
			if(!clone)
			{
				clone = texture.clone();
				backup = texture.clone();
			}
			else
				texture.copyTo( clone );
			clone.copyTo( texture, shader, { u_size: vec4.fromValues( texture.width, texture.height, 1/texture.width, 1/texture.height )} );
			LS.RM.resourceModified( texture );
			RenderModule.requestFrame();
		}

		function inner_restore()
		{
			if(!backup)
				return;
			backup.copyTo( texture );
			RenderModule.requestFrame();
		}
	},

	exportToFile: function( texture )
	{
		if(!texture)
			return;
		var file = texture.toBlob();
		LiteGUI.downloadFile("export.png", file );
	},

	showResizeDialog: function( texture, on_complete )
	{
		var dialog = new LiteGUI.Dialog( { title:"Resize Texture", close: true, minimize: true, width: 300, height: 440, scroll: false, draggable: true});
		dialog.show();
		dialog.setPosition(100,100);

		var widgets = new LiteGUI.Inspector( { name_width: "50%" } );
		dialog.add( widgets );

		widgets.widgets_per_row = 2;
		var width = texture.width;
		var height = texture.height;

		var width_widget = widgets.addNumber("Width", texture.width, { width: "75%", callback: function(v){
			width = v;
		}});
		widgets.addButton(null, "Nearest POT", { width: "25%", callback: function(){
			width = GL.Texture.nextPOT( width_widget.getValue() );
			width_widget.setValue( width );
		}});

		var height_widget = widgets.addNumber("Height", texture.height, { width: "75%", callback: function(v){
			height = v;
		}});
		widgets.addButton(null, "Nearest POT", { width: "25%", callback: function(){
			height = GL.Texture.nextPOT( height_widget.getValue() );
			height_widget.setValue( height );
		}});

		widgets.widgets_per_row = 1;

		widgets.addButton(null,"Resize", inner_apply );

		dialog.show();
		dialog.adjustSize();		

		function inner_apply()
		{
			TextureTools.resizeTexture( texture, width, height );
			if(on_complete)
				on_complete(resized_texture);
		}
	},

	resizeTexture: function( texture, width, height )
	{
		var info = texture.getProperties();
		info.wrap = GL.REPEAT;
		info.minFilter = GL.LINEAR_MIPMAP_LINEAR;
		if(width == texture.width && height == texture.height)
			return;
		var resized_texture = new GL.Texture( width, height, info );
		texture.copyTo( resized_texture );
		LS.RM.registerResource( texture.filename, resized_texture );
		var filename = texture.fullpath || texture.filename;
		var ext = LS.RM.getExtension( filename );
		var info = LS.Formats.getFileFormatInfo( ext );
		if( info.native ) 
		{
			if(ext == "jpg")
				ext = "jpeg";
			texture._original_data = texture.toBinary( false, 'image/' + ext );
		}
		else //convert to PNG
		{
			texture._original_data = texture.toBinary( false, 'image/png' );
			LS.RM.renameResource( filename, filename + ".png" );
		}
		return resized_texture;
	},

	showBlurDialog: function( texture )
	{
		var dialog = new LiteGUI.Dialog( { title:"Blur Texture", close: true, minimize: true, width: 300, height: 440, scroll: false, draggable: true});
		dialog.show();
		dialog.setPosition(100,100);

		var widgets = new LiteGUI.Inspector( { name_width: "50%" } );
		dialog.add( widgets );

		var iterations = 1;
		var size = 1;
		var temp = null;

		widgets.addNumber("Iterations", iterations, { min:1, step:1, precision:0, callback: function(v){
			iterations = v;
		}});

		widgets.addSlider("Size", size, { min:0, max:2, callback: function(v){
			size = v;
		}});

		widgets.addButton(null, "Apply Blur", { callback: function(){
			for(var i = 0; i < iterations; ++i)
				temp = texture.applyBlur(size,size,1,temp);
			RenderModule.requestFrame();
		}});

		dialog.show();
		dialog.adjustSize();		
	},

	showFillDialog: function( texture )
	{
		var dialog = new LiteGUI.Dialog( { title:"Fill Texture", close: true, minimize: true, width: 300, height: 440, scroll: false, draggable: true});
		dialog.show();
		dialog.setPosition(100,100);

		var widgets = new LiteGUI.Inspector( { name_width: "50%" } );
		dialog.add( widgets );

		var color = vec4.fromValues(1,1,1,1);

		widgets.addColor("Color", color, { callback: function(v){
			color.set( v );
		}});

		widgets.addSlider("Alpha", color[3], { min:0, max:1, callback: function(v){
			color[3] = v;
		}});

		widgets.addButton(null, "Fill", { callback: function(){
			texture.fill(color);
			RenderModule.requestFrame();
		}});

		dialog.show();
		dialog.adjustSize();		
	}

};

GL.Texture.prototype.inspect = function( widgets, skip_default_widgets )
{
	var texture = this;
	var formats = { 6407: "gl.RGB", 6408: "gl.RGBA", };
	var texture_types = { 3553: "gl.TEXTURE_2D", 34067: "gl.TEXTURE_CUBE_MAP" };
	var types = { 5121: "gl.UNSIGNED_BYTE", 36193: "gl.HALF_FLOAT_OES", 5126: "gl.FLOAT" };

	widgets.addString("Filename", texture.filename || "" );
	widgets.addStringButton("Width", texture.width, { button: "POT", callback_button: resize_to_pot });
	widgets.addStringButton("Height", texture.height, { button: "POT", callback_button: resize_to_pot });
	widgets.addString("Format", formats[ texture.format ] || "unknown" );
	widgets.addString("Type", types[ texture.type ] || "unknown" );
	widgets.addString("Texture type", texture_types[ texture.texture_type ] || "unknown" );

	widgets.addTitle("Actions");

	widgets.widgets_per_row = 2;
	
	widgets.addButton(null, "Blur", function(){
		TextureTools.showBlurDialog( texture );
	});

	widgets.addButton(null, "Apply shader", function(){
		TextureTools.showApplyShaderDialog( texture );
	});
	widgets.addButton(null, "Fill", function(){
		TextureTools.showFillDialog( texture );
	});
	widgets.addButton(null, "Resize", function(){
		TextureTools.showResizeDialog( texture );
	});

	widgets.widgets_per_row = 1;

	var clone_name = LS.RM.getBasename( texture.filename ) + "_clone.png";
	widgets.addStringButton("Clone", clone_name, { button: "Clone", button_width: "25%", callback: function(v){
		clone_name = v;
	},callback_button: function(v){
		if(!clone_name)
			return;
		var cloned_texture = texture.clone();
		LS.RM.registerResource( clone_name, cloned_texture );
	}});

	if(!skip_default_widgets)
		DriveModule.addResourceInspectorFields( this, widgets );

	function resize_to_pot()
	{
		var width = GL.Texture.nextPOT( texture.width );
		var height = GL.Texture.nextPOT( texture.height );
		TextureTools.resizeTexture( texture, width, height );
	}
}

CORE.registerModule( TextureTools );