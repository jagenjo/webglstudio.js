//WORK IN PROGRESS

var MitsubaTool = {

	name: "mitsuba",
	preferences: {
		server_url: null
	},

	init: function()
	{
		LiteGUI.menubar.add("Window/Mitsuba", { callback: function() { MitsubaTool.showDialog(); }});
	},

	deinit: function()
	{
		LiteGUI.menubar.remove("Window/Mitsuba");
	},

	showDialog: function()
	{
		var that = this;
		var dialog = new LiteGUI.Dialog( { title: "Mitsuba", close: true, width: 600, height: 350, scroll: false, draggable: true } );

		var settings = {
			resolution: [1024,768],
			samples: 64,
			max_depth: 4,
			integrator: 'bdpt',
			light_factor: 1000
		};

		var area = new LiteGUI.Area({width:"100%",height:"100%"});
		area.split("horizontal",["40%",null]);
		dialog.add(area);
		
		var inspector_left = new LiteGUI.Inspector( null, { scroll: true, resizable: true, full: true});
		inspector_left.addTitle("Settings");
		inspector_left.addString("URL","");
		inspector_left.addButton("Connection","Test server");
		inspector_left.addTitle("Rendering");
		inspector_left.addCombo("Quality","High",{ values:["Low","Medium","High"] });
		inspector_left.addCombo("Resolution","Viewport",{ values:["Viewport","720p","1080p","4K","Custom"] });
		inspector_left.addSeparator();
		inspector_left.addButton( null, "Render FRAME", { callback: function(){
			
		}});

		area.getSection(0).add( inspector_left );

		var console_area = area.getSection(1);
		var console = new LiteGUI.Console();
		console_area.add( console );
		console.addMessage("not connected");

		dialog.show();
	},

	renderFrame: function( settings, on_complete )
	{
		var msg = {};

		msg.xml = this.buildXML( settings );

		LS.Network.request();		
	},

	buildXML: function( settings, scene )
	{
		settings = settings || {};
		scene = scene || LS.GlobalScene;

		if(!settings.integrator) settings.integrator = 'bdpt';
		if(!settings.resolution) settings.resolution = [1024,768];
		if(!settings.samples) settings.samples = 64;
		if(!settings.max_depth) settings.max_depth = 4;

		var xml = '<?xml version="1.0" encoding="utf-8"?>\n<scene version="0.5.0">\n';

		//add integrator (global settings)
		xml += this.globalSettingsToXML( settings );

		//get scene info
		var camera = RenderModule.getActiveCamera(); //LS.GlobalScene.getCamera();
		var ris = scene._instances;
		var lights = scene._lights;
		var materials = LS.Renderer._visible_materials;

		//add materials 
		for(var i in materials)
		{
			var mat = materials[i];
			xml += this.materialToXML( mat );
		}
		
		//add shapes (render instances)
		for(var i in ris)
			xml += this.renderInstanceToXML( ris[i] );

		//add lights 
		for(var i in lights)
			xml += this.lightToXML( lights[i], settings );

		xml += this.sceneToXML( scene );

		//add sensor (camera)
		xml += this.cameraToXML( camera, settings );

		return xml + '</scene>';
	},

	materialToXML: function( material )
	{
		if( material.constructor !== LS.MaterialClasses.StandardMaterial )
		{
			console.warn("Material not supported:", material);
			return "";
		}

		var type = 'diffuse';
		//if( material.reflection )
		//	type = 'roughdielectric';

		var xml = '<bsdf type="'+type+'" id="'+material.uid.substr(1)+'">\n';
		xml += '	<srgb name="reflectance" value="'+tohex(material.color)+'"/>\n';
		xml += '	<float name="alpha" value="'+material.opacity.toFixed(2)+'"/>\n';
		return xml + "</bsdf>\n";

		function tohex(color)
		{
			return RGBToHex(color[0],color[1],color[2]);
		}
	},

	renderInstanceToXML: function( instance )
	{
		var type = 'sphere';
		var mat = mat4.transpose( mat4.create(), instance.matrix );

		var xml = '<shape type="'+type+'">\n\
		<transform name="toWorld">\n\
			<matrix value="'+mat.toString()+'"/>\n\
		</transform>\n\
		<ref id="'+instance.material.uid.substr(1)+'"/>\n\
</shape>\n';
		return xml;
	},

	lightToXML: function( light, settings )
	{
		var type = null;
		switch(light.type)
		{
			case LS.Light.OMNI:	type = "point"; break;
			case LS.Light.SPOT: type = "spot"; break;
			case LS.Light.DIRECTIONAL: type = "directional"; break;
		}

		var factor = settings.light_factor || 1000;
		var radiance = [ light.color[0] * light.intensity * factor, light.color[1] * light.intensity * factor, light.color[2] * light.intensity * factor];

		var mat = mat4.transpose( mat4.create(), light.getTransformMatrix() );

		//<lookat origin="'+light.position.toString()+'" target="'+light.target.toString()+'"/>\n

		var xml = '<emitter type="'+type+'">\n\
		<transform name="toWorld">\n\
			<matrix value="'+mat.toString()+'"/>\n\
		</transform>\n\
		<spectrum name="intensity" value="'+radiance.toString()+'"/>\n';

		if( light.type === LS.Light.SPOT )
			xml += '		<float name="cutoffAngle" value="'+light.angle.toFixed(2)+'"/>\n';
		xml += "</emitter>\n";
		return xml;
	},

	cameraToXML: function( camera, settings )
	{
		var xml = '<sensor type="'+ (camera.type === LS.Camera.PERSPECTIVE ? 'perspective' : 'orthographic') +'">\n\
		<float name="farClip" value="'+camera.far+'"/>\n\
		<float name="focusDistance" value="'+camera.focalLength+'"/>\n\
		<float name="fov" value="'+camera.fov+'"/>\n\
		<string name="fovAxis" value="x"/>\n\
		<float name="nearClip" value="'+camera.near+'"/>\n\
		<transform name="toWorld">\n\
			<lookat target="'+camera.center.toString()+'" origin="'+camera.eye.toString()+'" up="'+camera.up.toString()+'"/>\n\
		</transform>\n\
		<sampler type="independent">\n\
			<integer name="sampleCount" value="'+settings.samples+'"/>\n\
		</sampler>\n\
		<film type="hdrfilm">\n\
			<integer name="height" value="'+settings.resolution[1].toFixed(0)+'"/>\n\
			<integer name="width" value="'+settings.resolution[0].toFixed(0)+'"/>\n\
			<rfilter type="gaussian"/>\n\
		</film>\n\
</sensor>\n';
		return xml;
	},

	sceneToXML: function( scene )
	{
		var ambient = scene.info ? scene.info.ambient_color : [0,0,0];
		return '<emitter type="constant">\n\
		<spectrum name="radiance" value="'+ambient.toString()+'"/>\n\
</emitter>\n';
	},

	globalSettingsToXML: function( settings )
	{
		return '<integrator type="'+settings.integrator+'">\n\
		<integer name="shadingSamples" value="'+settings.samples+'"/>\n\
		<integer name="maxDepth" value="'+settings.max_depth+'"/>\n\
</integrator>\n';
	}

};

CORE.registerModule( MitsubaTool );

//Format
/*
var parserMitsubaXML = {
	extension: "xml",
	subextension: "mitsuba",
	type: "scene",
	resource: "SceneNode",
	format: "text",
	dataType:'text',

	parse: function( data, options, filename )
	{
		if(!data || data.constructor !== String)
		{
			console.error("XML parser requires string");
			return null;
		}
	}
}

LS.Formats.addSupportedFormat( "xml", parserMitsubaXML );
*/