# WebGLStudio #

Welcome to the guide to understand and use WebGLStudio.

First of all remind you that this is a work-in-progress project that at this moment is maintained by a single person,
and due to the scope of the project it is still in a beta state. However we have been using it for several internal projects
with very good results.

## What is WebGLStudio? ##

WebGLStudio is an open-source 3D scene editor for the web, developed in Javascript, it includes its own 3D Engine
(for more information about the engine visit [LiteScene repository](https://github.com/jagenjo/litescene.js)) and other interesting features like code editing, resources managment, 
graph behaviours, animations, and a user-friendly interface.

It has been created to be very modular and easy to expand by not forcing any rendering pipeline (but providing one).

Any creation done in WebGLStudio can be easily shared online with a link, exported in a ZIP (including data and player) or embeded in an existing website.

Creations could be packed in one single file (ZIP or special binary format) so it is easy to store and share.

## But what can I do with it? ##

You can import assets from different sources (3D Meshes, textures, sounds, animations) and arrange them in a 3D Space.
Then you can edit their visual appearence, add behaviours through scripting in javascript or using the graph system, use HTML to create the interface, and when your scene is ready you can share it using one link.

## Can I create 3D models? ##

No, WebGLStudio is not a 3D Modeling software (maybe in the future), for that purpose I recommend to use Blender or check online tools like Clara.io

## What if I'm an advanced user? ##

WebGLStudio allows to code your own shaders from the editor, create your own post-processing effects, even redo the render pipeline. All the engine is done in Javascript, so it means you have total freedom to change any part.

## Who has developed WebGLStudio? ##

It has been developed by Javi Agenjo at the Interactive Technologies Group (GTI) at University Pompeu Fabra (Barcelona),
thanks to fundings from the European Union and local institutions.

## Is there any tutorials, videos, books or content to learn how to use it? ##

Not yet, but I'm working on that, but there are guides in the repositories of LiteScene, LiteGraph and LiteGL.

## Which major features are missing? ##

There is no physics engine working yet (although there had been some test), also there is basic frustum culling and no spatial tree, that means there is a big performance drop in scene with hundres of meshes (work in progress).

You cannot import FBXs (although DAEs are supported which contain the same info).

## Which Licensing does it use? ##

It uses the MIT license, which means that you can use this software for whatever you want as long as you keep the same licensing.

You are free to install it in your server and modify it to your own purposes.

